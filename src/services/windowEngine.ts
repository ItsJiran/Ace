import { StorageEngine } from './storageEngine';
import { EventBus } from './eventEngine';
import { RegistryEngine } from './registryEngine';
import { GlobalStateManager } from './globalStateManager';
import { ProcessEngine } from './processEngine';
import { invoke } from '@tauri-apps/api/core';
import type { WindowConfig, GlobalOverlayState } from '#/schemas/window';
import type { GlobalState } from '#/schemas/globalState';
import type { AnimationSequence, BoundsAnchor } from '#/schemas/animation';
import { CursorBridge } from './window/CursorBridge';
import { AlwaysOnTopBridge } from './window/AlwaysOnTopBridge';
import { WindowAnimationController } from './window/WindowAnimationController';
import SpawnQueueWorker from '#/workers/spawnQueueWorker?worker';

export interface SpawnWindowOptions {
    /** 
     * Identify the target window from the registry.
     * Recommendation: Use `package` and `window` for precise lookup.
     */
    package?: string;
    window?: string;
    component_name?: string;

    // Overrides
    title?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    opacity?: number;
    is_locked?: boolean;
    always_on_top?: boolean;
    chrome_style?: 'standard' | 'borderless';
    drag_surface?: 'header' | 'full';
    hide_ring?: boolean;
    z_index?: number;
    animation_sequence?: AnimationSequence;
}

/**
 * The WindowEngine is responsible for managing the logical boundaries, focus, and state
 * of the 2D overlay layer. It does NOT render UI directly. Instead, it syncs state
 * immediately into the Global Storage RAM.
 */
class WindowEngineSingleton {
    private highest_z_index = 100;
    private isRouteBound = false;
    
    // Sub-systems
    
    /**
     * Spawn Queue Worker: Manages spawn queueing in a separate thread.
     * Prevents main UI thread blocking from delaying spawn operations.
     */
    private spawnQueueWorker: Worker;
    
    /**
     * Map of pending spawn requests by UID (for tracking/cancellation)
     */
    private pendingSpawnRequests = new Map<string, SpawnWindowOptions>();

    /**
     * ARCHITECTURE: Debounce focus updates to prevent cascading subscriptions
     * When 50 windows check focus simultaneously, threads block.
     * This batches focus updates to avoid thrashing subscription evaluations.
     */
    private pendingFocusWindow: string | null = null;
    private focusUpdateScheduled = false;

    /**
     * Deferred Memory Write Queue: applies storage writes one-by-one using timeout.
      * Delay adapts based on RAF frame time + queue pressure.
     */
    private deferredWrites: Array<() => void> = [];
    private writeScheduled = false;
     private static readonly WRITE_DELAY_MIN_MS = 10;
     private static readonly WRITE_DELAY_MAX_MS = 50;

     /**
      * RAF performance sampling for adaptive spawn pacing.
      */
     private frameTimeEmaMs = 16.67;
     private currentFrameTimeMs = 16.67;
     private lastRafTs = 0;
     private static readonly CURRENT_FPS_WEIGHT = 0.6;
    /**
     * Bridges the native OS Cursor interactions with the Overlay state.
     * 
     * Rationale:
     * - We render a transparent full-screen window. By default, this blocks ALL clicks to the OS.
     * - We need to intelligently toggle the window between "click-through" (Ambient) and "interactive" (Interactive).
     * - Browser Engine typically doesn't know what's BEHIND the webview (OS desktop, other apps).
     * - This Bridge polls cursor position against our internal Window Registry bounds to determine if/when to let clicks pass through.
     */
    private cursorBridge: CursorBridge;

    /**
     * Enforces the Overlay's "Always On Top" status at the OS level.
     * 
     * Rationale:
     * - Some Linux WMs or OS behaviors fight for focus.
     * - This bridge periodically re-asserts our z-order at the OS level to ensure the Assistant remains visible.
     */
    private alwaysOnTopBridge: AlwaysOnTopBridge;

    /**
     * Manages high-performance animation loops (RAF) for window movement/transitions.
     * Decouples the "Engine" state logic from the per-frame math of moving windows.
     */
    private animationController: WindowAnimationController;

    /**
     * Rendering Queue: separates logical window creation from DOM rendering.
     * 
     * Problem: Writing to system:active_windows at 50ms intervals causes React
     * to re-render the App component 40 times when spawning 40 windows.
     * Each re-render tries to reconcile new MemoizedWindowItems in the DOM,
     * freezing the main thread for multiple frames.
     * 
     * Solution: Batch DOM insertions every 150-200ms instead.
     * - Logical: Windows added to system:active_windows immediately (50ms)
     * - Rendering: Windows added to system:rendered_windows in batches (150ms)
     * - App.tsx subscribes to system:rendered_windows only
     * 
     * Result: Smooth spawn animation (~40-60 FPS) with batched DOM insertion.
     */
    private renderingQueue: string[] = [];  // Window UIDs pending DOM insertion
    private renderingQueueTimer: ReturnType<typeof setTimeout> | null = null;
    private static readonly RENDERING_QUEUE_INTERVAL_MS = 120;  // Frequent smaller batches to reduce burst cost
    private static readonly RENDERING_BATCH_SIZE = 2;  // Smaller batch avoids heavy reconciliation spikes

    /**
     * Deferred animation requests for windows that are not yet spawned
     * (common when spawn queue is active and client calls playAnimation immediately).
     */
    private pendingAnimations = new Map<string, AnimationSequence>();

    /**
     * Fix A: Debounce guard for set_ignore_cursor_events IPC.
     * Prevents redundant native IPC calls when multiple code paths fire the same
     * mode in quick succession (e.g. CursorBridge + flushPendingFocus + enterWindowSurface).
     */
    private lastCursorEventsIgnore: boolean | null = null;
    private lastCursorEventsAt = 0;
    private static readonly CURSOR_EVENTS_DEBOUNCE_MS = 250;

    constructor() {
        this.cursorBridge = new CursorBridge((mode) => this.setOverlayMode(mode));
        this.alwaysOnTopBridge = new AlwaysOnTopBridge();

        
        this.animationController = new WindowAnimationController(
            (uid, x, y, w, h) => this.updateWindowBounds(uid, x, y, w, h, true),
            (uid) => this.closeWindow(uid)
        );

        // Initialize spawn queue worker
        this.spawnQueueWorker = new SpawnQueueWorker();
        this.spawnQueueWorker.onmessage = (event: MessageEvent) => {
            const { type, payload } = event.data;
            if (type === 'spawn') {
                const { id } = payload;
                const spawnOptions = this.pendingSpawnRequests.get(id);
                if (spawnOptions) {
                    this.pendingSpawnRequests.delete(id);
                    this.spawnWindowImmediate(spawnOptions);
                }
            }
        };

        this.startAdaptivePacingLoop();

        this.initializeState();
        
        // Start background bridges
        this.cursorBridge.start();
        this.alwaysOnTopBridge.start();
    }

    /**
     * Fix A: Deduplicating wrapper around set_ignore_cursor_events.
     * Skips the IPC call if the same value was sent within the debounce window.
     */
    private fireSetIgnoreCursorEvents(ignore: boolean): void {
        const now = performance.now();
        if (
            this.lastCursorEventsIgnore === ignore &&
            now - this.lastCursorEventsAt < WindowEngineSingleton.CURSOR_EVENTS_DEBOUNCE_MS
        ) {
            return;
        }
        this.lastCursorEventsIgnore = ignore;
        this.lastCursorEventsAt = now;
        invoke('set_ignore_cursor_events', { ignore }).catch(console.error);
    }

    private initializeState() {
        // 1. Initialize the root Overlay State
        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:overlay_state',
            payload: {
                mode: 'ambient',
                focused_window_uid: null,
                mouse_x: 0,
                mouse_y: 0,
                debug_bg: import.meta.env?.DEV ? false : false,
                is_overlay_locked: false,
            } satisfies GlobalOverlayState,
            classifications: ['system:core']
        });

        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:active_windows',
            payload: [] as Array<{ uid: string; component: string }>,
            classifications: ['system:core']
        });

        // Separate memory for DOM rendering (batched, slower rate)
        // App.tsx subscribes to this instead of system:active_windows
        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:rendered_windows',
            payload: [] as Array<{ uid: string; component: string }>,
            classifications: ['system:core']
        });

        // Fix C: Prewarm the native IPC bridge at boot so the first spawn
        // does not pay the cold-path cost of the first-ever Tauri invoke.
        invoke('set_ignore_cursor_events', { ignore: true })
            .then(() => {
                this.lastCursorEventsIgnore = true;
                this.lastCursorEventsAt = performance.now();
            })
            .catch(() => {});
    }

    registerEventRoutes() {
        if (this.isRouteBound) return;

        const coreHandler = async (interaction: any) => {
            const { action, payload, source } = interaction;
            const sourceProcessUid = typeof source?.process_uid === 'string' ? source.process_uid : undefined;

            await ProcessEngine.track(
                `window:${action}`,
                {
                    action,
                    source_process_uid: sourceProcessUid,
                },
                async () => {
                    if (action === 'open_window') {
                        this.spawnWindow(payload);
                    }
                    if (action === 'set_overlay_mode') {
                        const mode = payload.mode as 'ambient' | 'interactive';
                        if (mode) this.setOverlayMode(mode);
                    }
                    if (action === 'debug_action') {
                        await this.handleDebugAction(payload);
                    }
                    if (action === 'close_window') {
                        const targetUid = payload?.window_uid || source?.window_uid;
                        if (targetUid) {
                            this.closeWindow(targetUid);
                        }
                    }
                },
                {
                    parent_process_uid: sourceProcessUid,
                    process_kind: 'window_task',
                    owner_engine: 'windowEngine',
                    payload: {
                        status: 'running',
                        action,
                    },
                },
            );
        };

        EventBus.registerProcessRoute('open_window', coreHandler);
        EventBus.registerProcessRoute('close_window', coreHandler);
        EventBus.registerProcessRoute('set_overlay_mode', coreHandler);
        EventBus.registerProcessRoute('debug_action', coreHandler);

        this.isRouteBound = true;
    }

    private async handleDebugAction(payload: any) {
         if (payload.action === 'toggle_debug_bg') {
             this.toggleDebugBg();
         }
         if (payload.action === 'toggle_overlay_lock') {
             const state = StorageEngine.readMemory('system:overlay_state') as GlobalOverlayState | undefined;
             if (state) {
                 StorageEngine.dispatchRAMAction({
                     action: 'update_memory',
                     memory_uid: 'system:overlay_state',
                     payload: { is_overlay_locked: !state.is_overlay_locked }
                 });
             }
         }
         if (payload.action === 'open_devtools') {
            try {
                await invoke('open_devtools');
            } catch (e) {
                console.warn('[WindowEngine] Failed to open devtools:', e);
            }
         }
         if (payload.action === 'focus_devtools') {
            try {
                // Determine if we need to relax always-on-top momentarily
                // (AlwaysOnTopBridge handles re-asserting later)
                const appWindow = await import('@tauri-apps/api/window').then(m => m.getCurrentWindow());
                await appWindow.setAlwaysOnTop(false);
                await invoke('focus_devtools');
            } catch (e) {
                console.warn('[WindowEngine] Failed to focus devtools:', e);
            }
         }
    }

    // ─── Core Logic ─────────────────────────────────────────────────────────────

    private getMouseFocusEnabled() {
        const mouseFocusMemory = StorageEngine.readMemory('system:mouse_focus_enabled');
        if (typeof mouseFocusMemory === 'boolean') return mouseFocusMemory;
        const globalState = StorageEngine.readMemory('system:global_state') as GlobalState | undefined;
        return globalState?.focus.mouse_focus_enabled ?? true;
    }

    getRegistry({ packageRef, slug }: { packageRef: string; slug: string }) {
        return RegistryEngine.getDomainEntry(packageRef, 'windows', slug);
    }

    setOverlayMode(mode: 'ambient' | 'interactive') {
        const overlayState = StorageEngine.readMemory('system:overlay_state') as GlobalOverlayState | undefined;
        if (overlayState?.mode === mode) return;

        GlobalStateManager.setOverlayMode(mode);
        
        // Update storage so CursorBridge sees the new mode on next poll
        if (overlayState) {
            StorageEngine.dispatchRAMAction({
                action: 'update_memory',
                memory_uid: 'system:overlay_state',
                payload: { mode }
            });
        }
        
        this.fireSetIgnoreCursorEvents(mode === 'ambient');
    }

    toggleDebugBg() {
        const state = StorageEngine.readMemory('system:overlay_state') as GlobalOverlayState;
        if (state) {
            StorageEngine.dispatchRAMAction({
                action: 'update_memory',
                memory_uid: 'system:overlay_state',
                payload: { debug_bg: !state.debug_bg }
            });
        }
    }

    setMousePosition(x: number, y: number) {
        GlobalStateManager.setCursorPosition(x, y);
    }

    /**
     * Enqueues one storage write and processes writes at timed intervals.
     * Delay starts at 80ms and applies exponential backoff under heavy queue load.
     */
    private enqueueDeferredWrite(writeAction: () => void): void {
        this.deferredWrites.push(writeAction);
        if (!this.writeScheduled) {
            this.writeScheduled = true;
            this.scheduleNextDeferredWrite();
        }
    }

    private scheduleNextDeferredWrite(): void {
        const delay = this.getAdaptiveWriteDelayMs();

        setTimeout(() => {
            this.processNextDeferredWrite();
        }, delay);
    }

    private processNextDeferredWrite(): void {
        const write = this.deferredWrites.shift();

        try {
            write?.();
        } catch (e) {
            console.error('[WindowEngine] Deferred write failed:', e);
        }

        const pending = this.deferredWrites.length;
        if (pending === 0) {
            this.writeScheduled = false;
            return;
        }

        this.scheduleNextDeferredWrite();
    }

    private getAdaptiveWriteDelayMs(): number {
        const pending = this.deferredWrites.length;
        // Parameter 1: EMA frame-time
        // Parameter 2: queue pressure
        // Parameter 3: weighted current frame-time (instantaneous FPS contribution)
        const weightedFrameMs =
            this.frameTimeEmaMs * (1 - WindowEngineSingleton.CURRENT_FPS_WEIGHT)
            + this.currentFrameTimeMs * WindowEngineSingleton.CURRENT_FPS_WEIGHT;
        const frameBased = Math.round(weightedFrameMs * 1.05);

        // Aggressive queue pressure penalty during burst spawns
        const pressurePenalty = pending >= 16 ? 22 : pending >= 10 ? 14 : pending >= 6 ? 8 : pending >= 3 ? 4 : 0;

        const candidate = frameBased + pressurePenalty;
        return Math.max(
            WindowEngineSingleton.WRITE_DELAY_MIN_MS,
            Math.min(WindowEngineSingleton.WRITE_DELAY_MAX_MS, candidate)
        );
    }

    private startAdaptivePacingLoop(): void {
        const tick = (ts: number) => {
            if (this.lastRafTs > 0) {
                const delta = ts - this.lastRafTs;
                // Clamp outliers to avoid spikes from tab switches.
                const clamped = Math.max(8, Math.min(80, delta));
                this.currentFrameTimeMs = clamped;
                // Faster EMA response so throttling reacts earlier to frame drops.
                this.frameTimeEmaMs = this.frameTimeEmaMs * 0.75 + clamped * 0.25;

                this.publishSpawnTelemetry();
            }

            this.lastRafTs = ts;
            requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
    }

    private publishSpawnTelemetry(): void {
        const activeSpawnLoad = this.pendingSpawnRequests.size + this.deferredWrites.length + this.renderingQueue.length;
        if (activeSpawnLoad === 0) return;

        const currentFps = Math.max(1, Math.min(240, 1000 / this.currentFrameTimeMs));
        const emaFps = Math.max(1, Math.min(240, 1000 / this.frameTimeEmaMs));

        this.spawnQueueWorker.postMessage({
            type: 'set_telemetry',
            payload: {
                current_fps: currentFps,
                ema_fps: emaFps,
                pressure: activeSpawnLoad,
            },
        });
    }
    // ─── Window Lifecycle ───────────────────────────────────────────────────────

    /**
     * Public entry point: enqueues a spawn request to the worker.
     * 
     * The spawn worker manages queueing and spawns windows at a steady 80ms interval
     * in a separate thread, preventing main UI thread blocking.
     */
    spawnWindow(options: SpawnWindowOptions): string | null {
        // Prime worker with freshest telemetry before enqueueing new burst items.
        this.publishSpawnTelemetry();

        // Allocate the UID immediately so callers can track it if needed
        const window_uid = 'win-' + Math.random().toString(36).substring(2, 9);
        const spawnOptions = { ...options, _reserved_uid: window_uid } as any;
        
        // Store the request for when worker tells us to spawn
        this.pendingSpawnRequests.set(window_uid, spawnOptions);
        
        // Send to worker for queueing
        this.spawnQueueWorker.postMessage({
            type: 'enqueue',
            payload: {
                id: window_uid,
                options: spawnOptions,
            },
        });
        
        return window_uid;
    }

    /**
     * Flushes the rendering queue: batches pending window UIDs into system:rendered_windows
     * at a slower rate than spawn operations (150ms batch rate).
     * 
     * This prevents React from re-rendering the App component 40 times when spawning 40 windows.
     * Instead, it batches 3 windows per 150ms increment, resulting in smooth DOM insertion
     * without frame drops.
     */
    private flushRenderingQueue(): void {
        if (this.renderingQueueTimer !== null) return; // Already scheduled
        if (this.renderingQueue.length === 0) return;

        this.renderingQueueTimer = setTimeout(() => {
            this.renderingQueueTimer = null;

            // Take up to BATCH_SIZE windows from the queue and add to rendered list
            const batch = this.renderingQueue.splice(0, WindowEngineSingleton.RENDERING_BATCH_SIZE);
            if (batch.length > 0) {
                const renderedWindows = (StorageEngine.readMemory('system:rendered_windows') as Array<{ uid: string; component: string }> | undefined) ?? [];
                
                // Build new rendered list with batch appended
                const newRenderedList = [
                    ...renderedWindows,
                    ...batch.map((uid) => {
                        const windowCfg = StorageEngine.readMemory(`system:window:${uid}`) as WindowConfig | undefined;
                        return { uid, component: windowCfg?.component ?? '' };
                    })
                ];

                StorageEngine.dispatchRAMAction({
                    action: 'create_memory',
                    memory_uid: 'system:rendered_windows',
                    payload: newRenderedList,
                    classifications: ['system:core']
                });

                // Start pending animations exactly when windows become rendered.
                // This keeps spawn visual and animation in sync.
                requestAnimationFrame(() => {
                    for (const uid of batch) {
                        const pendingSeq = this.pendingAnimations.get(uid);
                        if (!pendingSeq) continue;
                        this.pendingAnimations.delete(uid);
                        this.animationController.playAnimation(uid, pendingSeq);
                    }
                });
            }

            // Schedule the next batch if any remain
            if (this.renderingQueue.length > 0) {
                this.flushRenderingQueue();
            }
        }, WindowEngineSingleton.RENDERING_QUEUE_INTERVAL_MS);
    }

    private spawnWindowImmediate(options: SpawnWindowOptions & { _reserved_uid?: string }): string | null {
        // Resolve package/window names to a unique entry reference
        let entryRef = '';
        
        if (options.package && options.window) {
            entryRef = `${options.package}:windows:${options.window}`;
        } else if (options.component_name) {
            // Legacy/Fallback behavior
            console.warn(`[WindowEngine] spawnWindow called with legacy 'component_name': ${options.component_name}. Please migrate to package/window inputs.`);
            // Attempt to guess or just use raw component name (which might work if registered locally)
            entryRef = options.component_name;
        } else {
            console.error('[WindowEngine] spawnWindow failed: Missing package/window or component_name identifiers.', options);
            return null;
        }

        const window_uid = options._reserved_uid ?? ('win-' + Math.random().toString(36).substring(2, 9));
        this.highest_z_index += 1;

        const freshWindow: WindowConfig = {
            window_uid,
            component: entryRef,
            // Defaults
            x: options.x ?? 100,
            y: options.y ?? 100,
            width: options.width ?? 400,
            height: options.height ?? 300,
            z_index: this.highest_z_index,
            
            // Overrides
            opacity: options.opacity ?? 1,
            is_locked: options.is_locked ?? false,
            always_on_top: options.always_on_top ?? false,
            chrome_style: options.chrome_style ?? 'standard',
            drag_surface: options.drag_surface ?? 'header',
            hide_ring: options.hide_ring ?? false,
            
            // State
            is_focused: false,
            is_minimized: false
        };

        // Defer heavy storage writes to run one-by-one with timeout pacing
        this.enqueueDeferredWrite(() => {
            StorageEngine.dispatchRAMAction({
                action: 'create_memory',
                memory_uid: `system:window:${window_uid}`,
                payload: freshWindow,
                classifications: ['system:windows']
            });
        });

        this.enqueueDeferredWrite(() => {
            const activeWindows = (StorageEngine.readMemory('system:active_windows') as Array<{ uid: string; component: string }> | undefined) ?? [];
            StorageEngine.dispatchRAMAction({
                action: 'create_memory',
                memory_uid: 'system:active_windows',
                payload: [...activeWindows, { uid: window_uid, component: entryRef }],
                classifications: ['system:core']
            });
        });

        // Queue for rendering and focus after active_windows is updated
        this.enqueueDeferredWrite(() => {
            // Queue window for DOM rendering in batches (separate from logical active_windows)
            // This prevents React from re-rendering App 40 times when spawning 40 windows
            this.renderingQueue.push(window_uid);
            this.flushRenderingQueue();

            this.focusWindow(window_uid);
        });

        // Store spawn animation until window is actually rendered.
        if (options.animation_sequence) {
            this.pendingAnimations.set(window_uid, options.animation_sequence);
        }

        return window_uid;
    }

    closeWindow(window_uid: string) {
        // Stop any running animations
        this.animationController.cancelAnimation(window_uid);
        this.pendingAnimations.delete(window_uid);

        // Remove from rendering queue if pending
        const queueIndex = this.renderingQueue.indexOf(window_uid);
        if (queueIndex !== -1) {
            this.renderingQueue.splice(queueIndex, 1);
        }

        // 1. Remove Granular Config
        StorageEngine.dispatchRAMAction({
            action: 'delete_memory',
            memory_uid: `system:window:${window_uid}`
        });

        const activeWindows = (StorageEngine.readMemory('system:active_windows') as Array<{ uid: string; component: string }> | undefined) ?? [];
        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:active_windows',
            payload: activeWindows.filter((entry) => entry.uid !== window_uid),
            classifications: ['system:core']
        });

        // Also remove from rendered windows (DOM)
        const renderedWindows = (StorageEngine.readMemory('system:rendered_windows') as Array<{ uid: string; component: string }> | undefined) ?? [];
        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:rendered_windows',
            payload: renderedWindows.filter((entry) => entry.uid !== window_uid),
            classifications: ['system:core']
        });

        const focusedWindowUid = (StorageEngine.readMemory('system:focused_window_uid') as string | null | undefined)
            ?? ((StorageEngine.readMemory('system:global_state') as GlobalState | undefined)?.focus.focused_window_uid ?? null);
        if (focusedWindowUid === window_uid) {
            GlobalStateManager.setFocusedWindow(null);
        }
    }

    updateWindowConfig(window_uid: string, updates: Partial<WindowConfig>) {
        const granularKey = `system:window:${window_uid}`;
        const currentGranular = StorageEngine.readMemory(granularKey) as WindowConfig | undefined;
        
        if (currentGranular) {
            const nextConfig = { ...currentGranular, ...updates };
            StorageEngine.dispatchRAMAction({
                action: 'update_memory',
                memory_uid: granularKey,
                payload: nextConfig
            });
        }
    }

    focusWindow(window_uid: string) {
        if (!this.getMouseFocusEnabled()) return;

        const focusedWindowUid = (StorageEngine.readMemory('system:focused_window_uid') as string | null | undefined)
            ?? ((StorageEngine.readMemory('system:global_state') as GlobalState | undefined)?.focus.focused_window_uid ?? null);

        const targetKey = `system:window:${window_uid}`;
        const targetCfg = StorageEngine.readMemory(targetKey) as WindowConfig | undefined;
        if (!targetCfg) return;

        // No-op fast path: already focused and on top.
        if (focusedWindowUid === window_uid && targetCfg.z_index >= this.highest_z_index) {
            return;
        }

        // ARCHITECTURE: Queue focus update instead of executing immediately
        // This prevents cascading subscription evaluations across 50 windows
        // Defer to next event loop to let mouse handler complete first
        this.pendingFocusWindow = window_uid;
        
        if (!this.focusUpdateScheduled) {
            this.focusUpdateScheduled = true;
            // Use setTimeout(..., 0) to push to macrotask queue
            // This gives the current frame time to complete rendering
            setTimeout(() => {
                this.flushPendingFocus();
            }, 0);
        }
    }

    private flushPendingFocus() {
        const window_uid = this.pendingFocusWindow;
        this.pendingFocusWindow = null;
        this.focusUpdateScheduled = false;
        
        if (!window_uid) return;

        const targetKey = `system:window:${window_uid}`;
        const targetCfg = StorageEngine.readMemory(targetKey) as WindowConfig | undefined;
        if (!targetCfg) return;

        // Now apply the actual focus update
        this.highest_z_index += 1;
        this.updateWindowConfig(window_uid, {
            z_index: this.highest_z_index
        });

        // Atomic: combines setFocusedWindow + setOverlayMode into one pass.
        // Eliminates duplicate writes to system:global_state and system:overlay_state.
        GlobalStateManager.setFocusedWindowInteractive(window_uid);

        this.fireSetIgnoreCursorEvents(false);
    }

    enterWindowSurface(window_uid: string) {
        if (!this.getMouseFocusEnabled()) {
            this.setOverlayMode('ambient');
            return;
        }
        const currentWindow = StorageEngine.readMemory(`system:window:${window_uid}`) as WindowConfig | undefined;
        if (!currentWindow) return;

        this.fireSetIgnoreCursorEvents(false);
    }

    leaveWindowSurface(_window_uid: string) {
        if (!this.getMouseFocusEnabled()) {
            this.setOverlayMode('ambient');
            return;
        }
        // Cursor bridge controls transitions
    }

    minimizeWindow(window_uid: string) {
        const cfg = StorageEngine.readMemory(`system:window:${window_uid}`) as WindowConfig | undefined;
        if (!cfg || cfg.is_minimized) return;

        this.updateWindowConfig(window_uid, { is_minimized: true });

        // If the minimized window was focused, clear focus + return to ambient
        const focusedUid = StorageEngine.readMemory('system:focused_window_uid') as string | null | undefined;
        if (focusedUid === window_uid) {
            GlobalStateManager.setFocusedWindow(null);
            this.setOverlayMode('ambient');
        }
    }

    restoreWindow(window_uid: string) {
        const cfg = StorageEngine.readMemory(`system:window:${window_uid}`) as WindowConfig | undefined;
        if (!cfg) return;

        this.updateWindowConfig(window_uid, { is_minimized: false });
        this.focusWindow(window_uid);
    }

    /**
     * Updates the logical position and size of a window in the Registry.
     * 
     * @param window_uid - The unique identifier of the window.
     * @param x - Absolute screen X position.
     * @param y - Absolute screen Y position.
     * @param width - Window width in pixels.
     * @param height - Window height in pixels.
     * 
     * Why Manual Bounds? (vs Browser Engine Automatic Layout)
     * 1. Persistence: Browser engines discard element state (scroll, position) on unmount/refresh. 
     *    We need windows to "remember" their last known position across sessions or "Show/Hide" toggles.
     * 2. Global Awareness: The Registry acts as a "Single Source of Truth" (SSOT) for the entire OS simulation.
     *    Other systems (e.g., Layout Engine, snapping logic, or multi-window communication) need to query 
     *    where a window IS without DOM access.
     * 3. Performance: Reading from RAM (O(1)) is faster than querying the DOM (forcing reflows) 
     *    when calculating complex interactions or animations.
     * 4. Decoupling: This allows "Headless" management. A window can exist in logic (e.g., minimized tray icon)
     *    without being rendered in the DOM at all, yet still have bounds ready for its return.
     */
    updateWindowBounds(window_uid: string, x: number, y: number, width: number, height: number, _skipMonolith = false) {
        // 1. Update Granular Config for subscribed components
        const granularKey = `system:window:${window_uid}`;
        const currentGranular = StorageEngine.readMemory(granularKey) as WindowConfig | undefined;
        
        if (currentGranular) {
            // Optimization: Skip if identical
            if (currentGranular.x === x && currentGranular.y === y && currentGranular.width === width && currentGranular.height === height) {
                return;
            }

            const nextConfig = { ...currentGranular, x, y, width, height };
            StorageEngine.dispatchRAMAction({
                action: 'update_memory',
                memory_uid: granularKey,
                payload: nextConfig
            });
        }
    }

    // ─── Animation Delegation ──────────────────────────────────────────────────

    isAnimationLocked(window_uid: string): boolean {
        return this.animationController.isAnimationLocked(window_uid);
    }

    playAnimation(window_uid: string, sequence: AnimationSequence): void {
        const exists = StorageEngine.readMemory(`system:window:${window_uid}`) as WindowConfig | undefined;
        if (!exists) {
            this.pendingAnimations.set(window_uid, sequence);
            return;
        }

        this.pendingAnimations.delete(window_uid);
        this.animationController.playAnimation(window_uid, sequence);
    }

    cancelAnimation(window_uid: string): void {
        this.animationController.cancelAnimation(window_uid);
    }

    retargetAnimation(window_uid: string, newTo: BoundsAnchor): void {
        this.animationController.retargetAnimation(window_uid, newTo);
    }
}

export const WindowEngine = new WindowEngineSingleton();
