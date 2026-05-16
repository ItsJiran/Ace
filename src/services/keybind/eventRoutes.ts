import { EventBus } from '#/services/eventEngine';
import { KernelEngine } from '#/services/kernelEngine';
import { GlobalStateManager } from '#/services/globalStateManager';
import { ConfigEngine } from '#/services/configEngine';
import { focusHostDevtools, openHostDevtools } from '#/services/runtime/desktopHost';

let isKeybindRouteBound = false;

export function registerKeybindEventRoutes() {
    if (isKeybindRouteBound) return;

    EventBus.registerProcessRoute('lookup', async (args) => {
        if (args.sub_action === 'toggle_overlay_mode') {
            const currentMode = GlobalStateManager.readDesktopState().mode;
            GlobalStateManager.setOverlayMode(currentMode === 'ambient' ? 'interactive' : 'ambient');
            return;
        }

        if (args.sub_action === 'cycle_window_display_mode') {
            GlobalStateManager.cycleWindowDisplayMode();
            return;
        }

        if (args.sub_action === 'set_window_mouse_focus' || args.sub_action === 'toggle_window_mouse_focus') {
            const currentEnabled = KernelEngine.readMemory('system:global_state:mouse_focus_enabled') ?? true;
            const rawEnabled = args.payload?.enabled;

            let enabled: boolean;
            if (args.sub_action === 'toggle_window_mouse_focus') {
                enabled = !currentEnabled;
            } else if (typeof rawEnabled === 'boolean') {
                enabled = rawEnabled === currentEnabled ? !currentEnabled : rawEnabled;
            } else {
                enabled = !currentEnabled;
            }

            await ConfigEngine.updateConfigItem('window.mouse_focus_enabled', enabled, 'Window', 'Whether mouse presence/click on a window is allowed to focus and activate that window. If disabled, windows remain transparent to mouse focus behavior.');

            GlobalStateManager.setMouseFocusEnabled(enabled);
            GlobalStateManager.setOverlayMode(enabled ? 'interactive' : 'ambient');
        }
    });

    EventBus.registerProcessRoute('debug_action', async (args) => {
        const action = typeof args.sub_action === 'string' && args.sub_action.length > 0
            ? args.sub_action
            : typeof args.payload?.action === 'string'
                ? args.payload.action
                : '';

        if (action === 'open_devtools') {
            await openHostDevtools();
            return;
        }

        if (action === 'focus_devtools') {
            await focusHostDevtools();
            return;
        }

        if (action === 'toggle_overlay_lock') {
            GlobalStateManager.toggleOverlayLocked();
            return;
        }

        if (action === 'toggle_debug_bg') {
            GlobalStateManager.toggleDebugBg();
        }
    });

    isKeybindRouteBound = true;
}