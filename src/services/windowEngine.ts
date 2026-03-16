import { Storage } from './storageEngine';
import { EventBus } from './eventEngine';
import { GlobalStateManager } from './globalStateManager';
import { invoke } from '@tauri-apps/api/core';
import { cursorPosition, getCurrentWindow } from '@tauri-apps/api/window';
import type { WindowConfig, GlobalOverlayState } from '#/schemas/window';
import type { GlobalState } from '#/schemas/globalState';

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

        // Debug: Pure Div Position
        Storage.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'debug:box_pos',
            payload: { x: 200, y: 200 },
            classifications: ['system:debug']
        });

        // 3. Register a command listener on the EventBus for generic window commands
        const coreHandler = async (interaction: any) => {
            const { action, sub_action, payload } = interaction;

             if (action === 'open_window') {
                this.spawnWindow(payload as any);
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
    spawnWindow(config: Omit<WindowConfig, 'window_uid' | 'z_index' | 'is_focused' | 'is_minimized' | 'opacity' | 'is_locked' | 'always_on_top' | 'chrome_style' | 'drag_surface'> & Partial<Pick<WindowConfig, 'opacity' | 'is_locked' | 'always_on_top' | 'chrome_style' | 'drag_surface'>>) {
        const window_uid = 'win-' + Math.random().toString(36).substring(2, 9);
        this.highest_z_index += 1;

        const freshWindow: WindowConfig = {
            ...config,
            opacity: config.opacity ?? 1,
            is_locked: config.is_locked ?? false,
            always_on_top: config.always_on_top ?? false,
            chrome_style: config.chrome_style ?? 'standard',
            drag_surface: config.drag_surface ?? 'header',
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
}

export const WindowEngine = new WindowEngineSingleton();
