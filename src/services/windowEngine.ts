import { StorageEngine } from './storageEngine';
import { EventBus } from './eventEngine';
import { RegistryEngine } from './registryEngine';
import { GlobalStateManager } from './globalStateManager';
import { invoke } from '@tauri-apps/api/core';
import type { WindowConfig, GlobalOverlayState } from '#/schemas/window';
import type { GlobalState } from '#/schemas/globalState';
import type { AnimationSequence, BoundsAnchor } from '#/schemas/animation';
import { CursorBridge } from './window/CursorBridge';
import { AlwaysOnTopBridge } from './window/AlwaysOnTopBridge';
import { WindowAnimationController } from './window/WindowAnimationController';

export interface SpawnWindowOptions {
    /** 
     * Identify the target window from the registry.
     * Recommendation: Use `package` and `window` for precise lookup.
     */
    package?: string;
    window?: string;

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
}

/**
 * The WindowEngine is responsible for managing the logical boundaries, focus, and state
 * of the 2D overlay layer. It does NOT render UI directly. Instead, it syncs state
 * immediately into the Global Storage RAM.
 */
class WindowEngineSingleton {
    private highest_z_index = 100;
    
    // Sub-systems
    
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

    constructor() {
        this.cursorBridge = new CursorBridge((mode) => this.setOverlayMode(mode));
        this.alwaysOnTopBridge = new AlwaysOnTopBridge();

        
        this.animationController = new WindowAnimationController(
            (uid, x, y, w, h) => this.updateWindowBounds(uid, x, y, w, h),
            (uid) => this.closeWindow(uid)
        );

        this.initializeState();
        this.registerEventHandlers();
        
        // Start background bridges
        this.cursorBridge.start();
        this.alwaysOnTopBridge.start();
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
                debug_bg: import.meta.env?.DEV ? false : false
            } satisfies GlobalOverlayState,
            classifications: ['system:core']
        });

        // 2. Initialize the Windows Dictionary
        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:windows',
            payload: {} as Record<string, WindowConfig>,
            classifications: ['system:core']
        });
    }

    private registerEventHandlers() {
        const coreHandler = async (interaction: any) => {
            const { action, payload } = interaction;

             if (action === 'open_window') {
                this.spawnWindow(payload);
            }
             if (action === 'set_overlay_mode') {
                const mode = payload.mode as 'ambient' | 'interactive';
                if (mode) this.setOverlayMode(mode);
            }
            if (action === 'debug_action') {
                 this.handleDebugAction(payload);
            }
            if (action === 'close_window') {
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
        invoke('set_ignore_cursor_events', { ignore: mode === 'ambient' }).catch(console.error);
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

    // ─── Window Lifecycle ───────────────────────────────────────────────────────

    spawnWindow(options: SpawnWindowOptions) {
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

        const window_uid = 'win-' + Math.random().toString(36).substring(2, 9);
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
            is_focused: true,
            is_minimized: false
        };

        // 1. Write Config to Granular RAM
        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: `system:window:${window_uid}`,
            payload: freshWindow,
            classifications: ['system:windows']
        });

        // 2. Update Active Window Index
        const activeWindows = (StorageEngine.readMemory('system:active_windows') as Array<{ uid: string, component: string }> || []);
        if (!activeWindows.find(w => w.uid === window_uid)) {
            const newIndex = [...activeWindows, { uid: window_uid, component: entryRef }];
            StorageEngine.dispatchRAMAction({
                action: 'create_memory',
                memory_uid: 'system:active_windows',
                payload: newIndex,
                classifications: ['system:core']
            });
        }

        // 3. Update Monolith (Backward Compat)
        const currentWindows = (StorageEngine.readMemory('system:windows') as Record<string, WindowConfig>) || {};
        Object.keys(currentWindows).forEach(key => {
            currentWindows[key].is_focused = false;
        });
        currentWindows[window_uid] = freshWindow;
        
        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:windows',
            payload: currentWindows
        });

        this.focusWindow(window_uid);
        return window_uid;
    }

    closeWindow(window_uid: string) {
        // Stop any running animations
        this.animationController.cancelAnimation(window_uid);

        // 1. Remove from Active Index
        const activeWindows = (StorageEngine.readMemory('system:active_windows') as Array<{ uid: string, component: string }> || []);
        const newIndex = activeWindows.filter(w => w.uid !== window_uid);
        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:active_windows',
            payload: newIndex,
            classifications: ['system:core']
        });

        // 2. Remove Granular Config
        StorageEngine.dispatchRAMAction({
            action: 'delete_memory',
            memory_uid: `system:window:${window_uid}`
        });

        // 3. Update Monolith
        const currentWindows = StorageEngine.readMemory('system:windows') as Record<string, WindowConfig>;
        if (currentWindows && currentWindows[window_uid]) {
            const wasFocused = currentWindows[window_uid].is_focused;
            delete currentWindows[window_uid];
            StorageEngine.dispatchRAMAction({
                action: 'create_memory',
                memory_uid: 'system:windows',
                payload: currentWindows
            });

            if (wasFocused) {
                GlobalStateManager.setFocusedWindow(null);
            }
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

        const currentWindows = StorageEngine.readMemory('system:windows') as Record<string, WindowConfig>;
        if (currentWindows && currentWindows[window_uid]) {
            currentWindows[window_uid] = { ...currentWindows[window_uid], ...updates };
            StorageEngine.dispatchRAMAction({
                action: 'create_memory',
                memory_uid: 'system:windows',
                payload: currentWindows
            });
        }
    }

    focusWindow(window_uid: string) {
        if (!this.getMouseFocusEnabled()) return;

        this.highest_z_index += 1;
        this.updateWindowConfig(window_uid, {
            z_index: this.highest_z_index,
            is_focused: true
        });

        // Unfocus others
        const activeWindows = (StorageEngine.readMemory('system:active_windows') as Array<{ uid: string }> || []);
        activeWindows.forEach(win => {
            if (win.uid !== window_uid) {
                const key = `system:window:${win.uid}`;
                const cfg = StorageEngine.readMemory(key) as WindowConfig | undefined;
                if (cfg && cfg.is_focused) {
                    this.updateWindowConfig(win.uid, { is_focused: false });
                }
            }
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
        const currentWindows = StorageEngine.readMemory('system:windows') as Record<string, WindowConfig>;
        if (!currentWindows[window_uid]) return;

        invoke('set_ignore_cursor_events', { ignore: false }).catch(console.error);
    }

    leaveWindowSurface(_window_uid: string) {
        if (!this.getMouseFocusEnabled()) {
            this.setOverlayMode('ambient');
            return;
        }
        // Cursor bridge controls transitions
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
    updateWindowBounds(window_uid: string, x: number, y: number, width: number, height: number, skipMonolith = false) {
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

        // 2. Update Monolith (Backward Compat) -> Can be skipped for high-frequency updates
        if (!skipMonolith) {
             const currentWindows = StorageEngine.readMemory('system:windows') as Record<string, WindowConfig>;
             if (currentWindows[window_uid]) {
                 currentWindows[window_uid] = { ...currentWindows[window_uid], x, y, width, height };
                 StorageEngine.dispatchRAMAction({
                     action: 'create_memory',
                     memory_uid: 'system:windows',
                     payload: currentWindows
                 });
             }
        }
    }

    // ─── Animation Delegation ──────────────────────────────────────────────────

    isAnimationLocked(window_uid: string): boolean {
        return this.animationController.isAnimationLocked(window_uid);
    }

    playAnimation(window_uid: string, sequence: AnimationSequence): void {
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
