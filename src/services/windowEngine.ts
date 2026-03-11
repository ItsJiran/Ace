import { Storage } from './storageEngine';
import { EventBus } from './eventEngine';
import { invoke } from '@tauri-apps/api/core';
import type { WindowConfig, GlobalOverlayState } from '#/schemas/window';

/**
 * The WindowEngine is responsible for managing the logical boundaries, focus, and state
 * of the 2D overlay layer. It does NOT render UI directly. Instead, it syncs state
 * immediately into the Global Storage RAM where React components (O(1) observers) 
 * will automatically react and re-render the changes.
 */
class WindowEngineSingleton {
    private highest_z_index = 100;

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
        EventBus.registerProcessRoute('window_engine_core', async (interaction) => {
            const { action, sub_action, payload } = interaction;

            if (action === 'open' && sub_action === 'open_window') {
                this.spawnWindow(payload as any);
            }
            if (action === 'close' && sub_action === 'close_window' && interaction.window_uid) {
                this.closeWindow(interaction.window_uid);
            }
        });
    }

    /**
     * Toggles the UI transparent layer interactivity mode.
     * Ambient: Ghosted, click-through overlay.
     * Interactive: Catching pointer events (e.g. Chat box clicked).
     */
    setOverlayMode(mode: 'ambient' | 'interactive') {
        Storage.dispatchRAMAction({
            action: 'update_memory',
            memory_uid: 'system:overlay_state',
            payload: { mode }
        });

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
        Storage.dispatchRAMAction({
            action: 'update_memory',
            memory_uid: 'system:overlay_state',
            payload: { mouse_x: x, mouse_y: y }
        });
    }

    /**
     * Spawns a physical Dumb Window UI block onto the screen.
     */
    spawnWindow(config: Omit<WindowConfig, 'window_uid' | 'z_index' | 'is_focused' | 'is_minimized'>) {
        const window_uid = 'win-' + Math.random().toString(36).substring(2, 9);
        this.highest_z_index += 1;

        const freshWindow: WindowConfig = {
            ...config,
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
            delete currentWindows[window_uid];
            Storage.dispatchRAMAction({
                action: 'create_memory',
                memory_uid: 'system:windows',
                payload: currentWindows
            });
        }
    }

    focusWindow(window_uid: string) {
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

        Storage.dispatchRAMAction({
            action: 'update_memory',
            memory_uid: 'system:overlay_state',
            payload: { focused_window_uid: window_uid, mode: 'interactive' }
        });

        invoke('set_ignore_cursor_events', { ignore: false }).catch(console.error);
    }

    updateWindowBounds(window_uid: string, x: number, y: number, width: number, height: number) {
        const currentWindows = Storage.readMemory('system:windows') as Record<string, WindowConfig>;
        if (!currentWindows[window_uid]) return;

        currentWindows[window_uid] = { ...currentWindows[window_uid], x, y, width, height };

        Storage.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:windows',
            payload: currentWindows
        });
    }
}

export const WindowEngine = new WindowEngineSingleton();
