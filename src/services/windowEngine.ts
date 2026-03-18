import { Storage } from './storageEngine';
import { EventBus } from './eventEngine';
import { GlobalStateManager } from './globalStateManager';
import { invoke } from '@tauri-apps/api/core';
import { cursorPosition, getCurrentWindow } from '@tauri-apps/api/window';
import type { WindowConfig, GlobalOverlayState } from '#/schemas/window';
import type { GlobalState } from '#/schemas/globalState';
import type { AnimationSequence, AnimationRuntimeState, BoundsAnchor, LiteralBounds } from '#/schemas/animation';
import { applyEasing } from '#/core/patterns/easing';

/**
 * The WindowEngine is responsible for managing the logical boundaries, focus, and state
 * of the 2D overlay layer. It does NOT render UI directly. Instead, it syncs state
 * immediately into the Global Storage RAM where React components (O(1) observers) 
 * will automatically react and re-render the changes.
 */
class WindowEngineSingleton {
    private highest_z_index = 100;
    private cursorBridgeIntervalId?: number;
    private alwaysOnTopIntervalId?: number;

    // Animation runtime state — keyed by window_uid
    private animationRafs = new Map<string, number>();
    private animationSeqs = new Map<string, AnimationSequence>();
    private animationCycles = new Map<string, number>();
    private animationSegmentIndex = new Map<string, number>();
    private animationRetargets = new Map<string, LiteralBounds>();

    private getMouseFocusEnabled() {
        const mouseFocusMemory = Storage.readMemory('system:mouse_focus_enabled');
        if (typeof mouseFocusMemory === 'boolean') {
            return mouseFocusMemory;
        }

        const globalState = Storage.readMemory('system:global_state') as GlobalState | undefined;
        return globalState?.focus.mouse_focus_enabled ?? true;
    }

    constructor() {
        // 1. Initialize the root Overlay State into accessible Global RAM
        Storage.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:overlay_state',
            payload: {
                mode: 'ambient',
                focused_window_uid: null,
                mouse_x: 0,
                mouse_y: 0,
                debug_bg: import.meta.env?.DEV ? false : false // Start transparent by default
            } satisfies GlobalOverlayState,
            classifications: ['system:core']
        });

        // 2. Initialize the Windows Dictionary into accessible Global RAM
        Storage.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:windows',
            payload: {} as Record<string, WindowConfig>,
            classifications: ['system:core']
        });

        // 3. Register a command listener on the EventBus for generic window commands
        const coreHandler = async (interaction: any) => {
            const { action, payload } = interaction;

             if (action === 'open_window') {
                this.spawnWindow(payload as any);
            }
             if (action === 'set_overlay_mode') {
                const mode = payload.mode as 'ambient' | 'interactive';
                if (mode) this.setOverlayMode(mode);
            }

            if (action === 'debug_action') {
                 if (payload.action === 'toggle_debug_bg') {
                     this.toggleDebugBg();
                 }
            }

            if (action === 'close_window') {
                // Determine target: Payload (External command) or Source (Self-close)
                const targetUid = payload?.window_uid || interaction.source?.window_uid || interaction.window_uid;
                if (targetUid) {
                    this.closeWindow(targetUid);
                }
            }
        };

        EventBus.registerProcessRoute('open_window', coreHandler);
        EventBus.registerProcessRoute('close_window', coreHandler);
        EventBus.registerProcessRoute('set_overlay_mode', coreHandler);
        EventBus.registerProcessRoute('debug_action', coreHandler);

        this.startCursorBridge();
        this.startAlwaysOnTopBridge();
    }

    private startAlwaysOnTopBridge() {
        if (this.alwaysOnTopIntervalId) return;

        const appWindow = getCurrentWindow();
        appWindow.setAlwaysOnTop(true).catch(() => {});

        appWindow.onFocusChanged(({ payload: focused }) => {
            if (!focused) {
                appWindow.setAlwaysOnTop(true).catch(() => {});
            }
        }).catch(() => {});

        // Some Linux window managers may still reshuffle z-order; re-assert periodically.
        this.alwaysOnTopIntervalId = window.setInterval(() => {
            appWindow.setAlwaysOnTop(true).catch(() => {});
        }, 2000);
    }

    private startCursorBridge() {
        if (this.cursorBridgeIntervalId) return;

        const appWindow = getCurrentWindow();
        let cachedInnerPos: { x: number; y: number } | null = null;
        let cachedScale = 1;
        let lastMetricsAt = 0;

        this.cursorBridgeIntervalId = window.setInterval(async () => {
            const state = GlobalStateManager.readState();

            // If mouse-focus behavior is disabled, always enforce ambient pass-through.
            if (!state.focus.mouse_focus_enabled) {
                const overlayState = Storage.readMemory('system:overlay_state') as GlobalOverlayState | undefined;
                if (overlayState?.mode !== 'ambient') {
                    this.setOverlayMode('ambient');
                }
                return;
            }

            const windows = (Storage.readMemory('system:windows') as Record<string, WindowConfig> | undefined) || {};
            const windowList = Object.values(windows).filter((win) => !win.is_minimized);

            if (windowList.length === 0) {
                return;
            }

            try {
                const cursor = await cursorPosition();
                const now = performance.now();

                // Window position/scale usually changes less frequently than cursor position.
                if (!cachedInnerPos || now - lastMetricsAt > 500) {
                    const innerPos = await appWindow.innerPosition();
                    const scale = await appWindow.scaleFactor();
                    cachedInnerPos = { x: innerPos.x, y: innerPos.y };
                    cachedScale = scale;
                    lastMetricsAt = now;
                }

                if (!cachedInnerPos) {
                    return;
                }

                // Convert global physical cursor to the overlay's logical coordinate space.
                const logicalCursorX = (cursor.x - cachedInnerPos.x) / cachedScale;
                const logicalCursorY = (cursor.y - cachedInnerPos.y) / cachedScale;

                const isCursorInsideAnyWindow = windowList.some((win) => {
                    return logicalCursorX >= win.x &&
                        logicalCursorX <= win.x + win.width &&
                        logicalCursorY >= win.y &&
                        logicalCursorY <= win.y + win.height;
                });

                const overlayState = Storage.readMemory('system:overlay_state') as GlobalOverlayState | undefined;
                const currentMode = overlayState?.mode ?? 'ambient';

                // Re-enable interaction when cursor enters any overlay window bounds.
                if (isCursorInsideAnyWindow && currentMode !== 'interactive') {
                    this.setOverlayMode('interactive');
                    return;
                }

                // Release back to pass-through when cursor leaves windows and user is not dragging.
                const isDragging = state.cursor.is_pointer_down;
                if (!isCursorInsideAnyWindow && !isDragging && currentMode !== 'ambient') {
                    this.setOverlayMode('ambient');
                }
            } catch {
                // Ignore cursor polling failures silently (e.g., unsupported platform edge case).
            }
        }, 48);
    }

    /**
     * Toggles the UI transparent layer interactivity mode.
     * Ambient: Ghosted, click-through overlay.
     * Interactive: Catching pointer events (e.g. Chat box clicked).
     */
    setOverlayMode(mode: 'ambient' | 'interactive') {
        const overlayState = Storage.readMemory('system:overlay_state') as GlobalOverlayState | undefined;
        if (overlayState?.mode === mode) {
            return;
        }

        GlobalStateManager.setOverlayMode(mode);

        // Send IPC ping to Tauri backend to physically toggle click-through
        invoke('set_ignore_cursor_events', { ignore: mode === 'ambient' }).catch(console.error);
    }

    toggleDebugBg() {
        const state = Storage.readMemory('system:overlay_state') as GlobalOverlayState;
        if (state) {
            Storage.dispatchRAMAction({
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
     * Spawns a physical Dumb Window UI block onto the screen.
     */
    spawnWindow(config: Omit<WindowConfig, 'window_uid' | 'z_index' | 'is_focused' | 'is_minimized' | 'opacity' | 'is_locked' | 'always_on_top' | 'chrome_style' | 'drag_surface' | 'hide_ring'> & Partial<Pick<WindowConfig, 'opacity' | 'is_locked' | 'always_on_top' | 'chrome_style' | 'drag_surface' | 'hide_ring'>>) {
        const window_uid = 'win-' + Math.random().toString(36).substring(2, 9);
        this.highest_z_index += 1;

        const freshWindow: WindowConfig = {
            ...config,
            opacity: config.opacity ?? 1,
            is_locked: config.is_locked ?? false,
            always_on_top: config.always_on_top ?? false,
            chrome_style: config.chrome_style ?? 'standard',
            drag_surface: config.drag_surface ?? 'header',
            hide_ring: config.hide_ring ?? false,
            window_uid,
            z_index: this.highest_z_index,
            is_focused: true,
            is_minimized: false
        };

        const currentWindows = Storage.readMemory('system:windows') as Record<string, WindowConfig>;

        // Remove focus from all others
        Object.keys(currentWindows).forEach(key => {
            currentWindows[key].is_focused = false;
        });

        // Add the new window
        currentWindows[window_uid] = freshWindow;

        // Commit full state back to RAM
        Storage.dispatchRAMAction({
            action: 'create_memory',   // It overwrites if we use the same ID, or we can use update_memory
            memory_uid: 'system:windows',
            payload: currentWindows
        });

        this.focusWindow(window_uid);
        return window_uid;
    }

    closeWindow(window_uid: string) {
        const currentWindows = Storage.readMemory('system:windows') as Record<string, WindowConfig>;
        if (currentWindows[window_uid]) {
            const wasFocused = currentWindows[window_uid].is_focused;
            delete currentWindows[window_uid];
            Storage.dispatchRAMAction({
                action: 'create_memory',
                memory_uid: 'system:windows',
                payload: currentWindows
            });

            if (wasFocused) {
                GlobalStateManager.setFocusedWindow(null);
            }
        }
    }

    /**
     * Updates arbitrary properties of a window configuration.
     * Useful for toggling lock state, opacity, etc.
     */
    updateWindowConfig(window_uid: string, updates: Partial<WindowConfig>) {
        const currentWindows = Storage.readMemory('system:windows') as Record<string, WindowConfig>;
        if (!currentWindows[window_uid]) return;

        const updatedConfig = { ...currentWindows[window_uid], ...updates };
        currentWindows[window_uid] = updatedConfig;

        Storage.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:windows',
            payload: currentWindows
        });
    }

    focusWindow(window_uid: string) {
        if (!this.getMouseFocusEnabled()) return;

        const currentWindows = Storage.readMemory('system:windows') as Record<string, WindowConfig>;
        if (!currentWindows[window_uid]) return;

        this.highest_z_index += 1;

        Object.keys(currentWindows).forEach(key => {
            currentWindows[key].is_focused = (key === window_uid);
        });
        currentWindows[window_uid].z_index = this.highest_z_index;

        Storage.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:windows',
            payload: currentWindows
        });

        GlobalStateManager.setFocusedWindow(window_uid);
        GlobalStateManager.setOverlayMode('interactive');

        invoke('set_ignore_cursor_events', { ignore: false }).catch(console.error);
    }

    enterWindowSurface(window_uid: string) {
        if (!this.getMouseFocusEnabled()) {
            this.setOverlayMode('ambient');
            return;
        }

        const currentWindows = Storage.readMemory('system:windows') as Record<string, WindowConfig>;
        if (!currentWindows[window_uid]) return;

        invoke('set_ignore_cursor_events', { ignore: false }).catch(console.error);
    }

    leaveWindowSurface(window_uid: string) {
        if (!this.getMouseFocusEnabled()) {
            this.setOverlayMode('ambient');
            return;
        }

        // Cursor bridge controls ambient/interactive transitions globally.
        // Keep this hook lightweight to avoid racing with the polling logic.
        void window_uid;
    }

    updateWindowBounds(window_uid: string, x: number, y: number, width: number, height: number) {
        const currentWindows = Storage.readMemory('system:windows') as Record<string, WindowConfig>;
        if (!currentWindows[window_uid]) return;

        const current = currentWindows[window_uid];
        if (
            current.x === x &&
            current.y === y &&
            current.width === width &&
            current.height === height
        ) {
            return;
        }

        currentWindows[window_uid] = { ...currentWindows[window_uid], x, y, width, height };

        Storage.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:windows',
            payload: currentWindows
        });
    }

    // ─── Animation Runtime ─────────────────────────────────────────────────────

    /**
     * Returns true if `window_uid` currently has a running animation with
        * `interrupt_policy: 'lock'`. Used by useAceWindow to block drag gestures.
     */
    isAnimationLocked(window_uid: string): boolean {
        const seq = this.animationSeqs.get(window_uid);
        return seq?.interrupt_policy === 'lock';
    }

    /**
     * Resolves a BoundsAnchor (semantic string, "current", or literal) to a
     * concrete LiteralBounds at the moment it is evaluated.
     */
    private resolveAnchor(anchor: BoundsAnchor, currentBounds: LiteralBounds): LiteralBounds {
        if (typeof anchor === 'object') {
            return anchor;
        }

        if (anchor === 'current') {
            return { ...currentBounds };
        }

        const vw = window.innerWidth;
        const vh = window.innerHeight;

        switch (anchor) {
            case 'screen:center':
                return { x: Math.round((vw - currentBounds.width) / 2), y: Math.round((vh - currentBounds.height) / 2), width: currentBounds.width, height: currentBounds.height };
            case 'screen:bottom_center':
                return { x: Math.round((vw - currentBounds.width) / 2), y: Math.round(vh - currentBounds.height - 90), width: currentBounds.width, height: currentBounds.height };
            case 'screen:top_center':
                return { x: Math.round((vw - currentBounds.width) / 2), y: 32, width: currentBounds.width, height: currentBounds.height };
            case 'screen:bottom_left':
                return { x: 32, y: Math.round(vh - currentBounds.height - 32), width: currentBounds.width, height: currentBounds.height };
            case 'screen:bottom_right':
                return { x: Math.round(vw - currentBounds.width - 32), y: Math.round(vh - currentBounds.height - 32), width: currentBounds.width, height: currentBounds.height };
            case 'screen:top_left':
                return { x: 32, y: 32, width: currentBounds.width, height: currentBounds.height };
            case 'screen:top_right':
                return { x: Math.round(vw - currentBounds.width - 32), y: 32, width: currentBounds.width, height: currentBounds.height };
        }
    }

    private lerpBounds(a: LiteralBounds, b: LiteralBounds, t: number): LiteralBounds {
        return {
            x: Math.round(a.x + (b.x - a.x) * t),
            y: Math.round(a.y + (b.y - a.y) * t),
            width: Math.round(a.width + (b.width - a.width) * t),
            height: Math.round(a.height + (b.height - a.height) * t),
        };
    }

    private writeAnimationRuntimeState(state: AnimationRuntimeState) {
        const existing = (Storage.readMemory('system:window_animations') as Record<string, AnimationRuntimeState> | undefined) ?? {};
        existing[state.window_uid] = state;
        Storage.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:window_animations',
            payload: existing,
        });
    }

    private clearAnimationRuntimeState(window_uid: string) {
        const existing = (Storage.readMemory('system:window_animations') as Record<string, AnimationRuntimeState> | undefined) ?? {};
        delete existing[window_uid];
        Storage.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:window_animations',
            payload: existing,
        });
    }

    /**
     * Plays an AnimationSequence on a window. The sequence is driven by a per-window
     * RAF loop inside WindowEngine — callers do not manage any RAF handles.
     *
     * When a sequence is already running on the same window:
     * - `lock`     → new call is ignored while the lock is active.
     * - `retarget` → current segment's `from` is snapped to live bounds and continues.
     * - `cancel`   → running sequence is stopped and the new one starts immediately.
     */
    playAnimation(window_uid: string, sequence: AnimationSequence): void {
        const existing = this.animationSeqs.get(window_uid);

        if (existing) {
            if (existing.interrupt_policy === 'lock') return;
            this.cancelAnimation(window_uid);
        }

        const currentWindows = Storage.readMemory('system:windows') as Record<string, WindowConfig>;
        if (!currentWindows[window_uid]) return;

        this.animationSeqs.set(window_uid, sequence);
        this.animationCycles.set(window_uid, 0);
        this.animationSegmentIndex.set(window_uid, 0);
        this.animationRetargets.delete(window_uid);

        let segIdx = 0;
        let segStartTime = -1;
        let segFrom: LiteralBounds | null = null;
        let segTo: LiteralBounds | null = null;
        let holdUntil = -1;

        const getCurrentLiveBounds = (): LiteralBounds => {
            const wins = Storage.readMemory('system:windows') as Record<string, WindowConfig>;
            const win = wins[window_uid];
            return win ? { x: win.x, y: win.y, width: win.width, height: win.height } : { x: 0, y: 0, width: 56, height: 56 };
        };

        const step = (now: number) => {
            const wins = Storage.readMemory('system:windows') as Record<string, WindowConfig>;
            if (!wins[window_uid]) {
                this.cleanupAnimation(window_uid);
                return;
            }

            const segments = sequence.segments;

            if (segIdx >= segments.length) {
                if (sequence.loop) {
                    segIdx = 0;
                    this.animationCycles.set(window_uid, (this.animationCycles.get(window_uid) ?? 0) + 1);
                } else {
                    const cycles = this.animationCycles.get(window_uid) ?? 0;
                    this.writeAnimationRuntimeState({
                        window_uid,
                        pattern_id: sequence.pattern_id,
                        positioning_mode: sequence.positioning_mode,
                        interrupt_policy: sequence.interrupt_policy,
                        current_phase: 'done',
                        segment_index: segments.length - 1,
                        total_segments: segments.length,
                        loop: sequence.loop,
                        cycles,
                        is_running: false,
                    });
                    this.cleanupAnimation(window_uid);

                    if (sequence.on_complete === 'close_window') {
                        this.closeWindow(window_uid);
                    } else if (typeof sequence.on_complete === 'object' && 'emit_event' in sequence.on_complete) {
                        EventBus.emit({
                            event_type: 'interaction',
                            action: sequence.on_complete.emit_event,
                            window_uid,
                            payload: {},
                        });
                    }
                    return;
                }
            }

            // Apply pending retarget (from retargetAnimation call)
            const retarget = this.animationRetargets.get(window_uid);
            if (retarget) {
                segFrom = { ...getCurrentLiveBounds() };
                segTo = retarget;
                segStartTime = now;
                this.animationRetargets.delete(window_uid);
                holdUntil = -1;
            }

            const seg = segments[segIdx];
            const liveBounds = getCurrentLiveBounds();

            // Initialize segment on first frame
            if (segStartTime < 0 || segFrom === null || segTo === null) {
                segFrom = this.resolveAnchor(seg.from, liveBounds);
                segTo = this.resolveAnchor(seg.to, { ...segFrom });
                segStartTime = now;
                holdUntil = -1;
                this.updateWindowBounds(window_uid, segFrom.x, segFrom.y, segFrom.width, segFrom.height);
            }

            // Hold phase after segment completes
            if (holdUntil > 0) {
                if (now < holdUntil) {
                    rafHandle = requestAnimationFrame(step);
                    this.animationRafs.set(window_uid, rafHandle);
                    return;
                }
                // Hold done, advance segment
                segIdx += 1;
                this.animationSegmentIndex.set(window_uid, segIdx);
                segFrom = null;
                segTo = null;
                segStartTime = -1;
                holdUntil = -1;
                rafHandle = requestAnimationFrame(step);
                this.animationRafs.set(window_uid, rafHandle);
                return;
            }

            const rawT = Math.min((now - segStartTime) / seg.duration_ms, 1);
            const easedT = applyEasing(seg.easing, rawT);
            const nextBounds = this.lerpBounds(segFrom, segTo!, easedT);

            this.updateWindowBounds(window_uid, nextBounds.x, nextBounds.y, nextBounds.width, nextBounds.height);

            this.writeAnimationRuntimeState({
                window_uid,
                pattern_id: sequence.pattern_id,
                positioning_mode: sequence.positioning_mode,
                interrupt_policy: sequence.interrupt_policy,
                current_phase: seg.phase_label,
                segment_index: segIdx,
                total_segments: segments.length,
                loop: sequence.loop,
                cycles: this.animationCycles.get(window_uid) ?? 0,
                is_running: true,
            });

            if (rawT >= 1) {
                if (seg.hold_ms > 0) {
                    holdUntil = now + seg.hold_ms;
                } else {
                    segIdx += 1;
                    this.animationSegmentIndex.set(window_uid, segIdx);
                    segFrom = null;
                    segTo = null;
                    segStartTime = -1;
                }
            }

            rafHandle = requestAnimationFrame(step);
            this.animationRafs.set(window_uid, rafHandle);
        };

        let rafHandle = requestAnimationFrame(step);
        this.animationRafs.set(window_uid, rafHandle);
    }

    /**
     * Cancels a running animation on the window immediately.
     * The window stays at its current bounds.
     */
    cancelAnimation(window_uid: string): void {
        this.cleanupAnimation(window_uid);
    }

    /**
     * Retargets the current running animation segment to a new destination anchor.
     * The segment snaps `from` to the live bounds and begins interpolating toward
     * the new target — no visual jump.
     *
     * Has no effect if no animation is running on the window.
     * Has no effect if the animation is `lock` policy.
     */
    retargetAnimation(window_uid: string, newTo: BoundsAnchor): void {
        const seq = this.animationSeqs.get(window_uid);
        if (!seq) return;
        if (seq.interrupt_policy === 'lock') return;

        const wins = Storage.readMemory('system:windows') as Record<string, WindowConfig>;
        const win = wins[window_uid];
        if (!win) return;

        const liveBounds: LiteralBounds = { x: win.x, y: win.y, width: win.width, height: win.height };
        const resolved = this.resolveAnchor(newTo, liveBounds);
        this.animationRetargets.set(window_uid, resolved);
    }

    private cleanupAnimation(window_uid: string): void {
        const raf = this.animationRafs.get(window_uid);
        if (raf !== undefined) {
            cancelAnimationFrame(raf);
            this.animationRafs.delete(window_uid);
        }
        this.animationSeqs.delete(window_uid);
        this.animationCycles.delete(window_uid);
        this.animationSegmentIndex.delete(window_uid);
        this.animationRetargets.delete(window_uid);
        this.clearAnimationRuntimeState(window_uid);
    }
}

export const WindowEngine = new WindowEngineSingleton();
