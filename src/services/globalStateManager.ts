import { Storage } from './storageEngine';
import type { GlobalState } from '#/schemas/globalState';
import type { GlobalOverlayState } from '#/schemas/window';
import type { ConfigItem } from '#/schemas/config';
import type { Keybind } from '#/schemas/keybinds';

const DEFAULT_GLOBAL_STATE: GlobalState = {
    cursor: {
        x: 0,
        y: 0,
        is_pointer_down: false,
        is_inside_app: false,
        last_updated_at: Date.now(),
    },
    focus: {
        overlay_mode: 'ambient',
        focused_window_uid: null,
        focused_widget_uid: null,
        active_element_tag: null,
        active_element_role: null,
        mouse_focus_enabled: true,
    },
    runtime: {
        active_config_items: [],
        active_keybinds: [],
        running_keybind_uids: [],
        last_triggered_keybind_uid: null,
        updated_at: Date.now(),
    },
};

class GlobalStateManagerSingleton {
    constructor() {
        const existing = Storage.readMemory('system:global_state');
        if (!existing) {
            Storage.dispatchRAMAction({
                action: 'create_memory',
                memory_uid: 'system:global_state',
                payload: DEFAULT_GLOBAL_STATE,
                classifications: ['system:core'],
            });
        }
    }

    readState() {
        return (Storage.readMemory('system:global_state') as GlobalState | undefined) ?? DEFAULT_GLOBAL_STATE;
    }

    setCursorPosition(x: number, y: number) {
        this.updateState((state) => ({
            ...state,
            cursor: {
                ...state.cursor,
                x,
                y,
                last_updated_at: Date.now(),
            },
        }));

        this.syncOverlayState({ mouse_x: x, mouse_y: y });
    }

    setPointerDown(is_pointer_down: boolean) {
        this.updateState((state) => ({
            ...state,
            cursor: {
                ...state.cursor,
                is_pointer_down,
                last_updated_at: Date.now(),
            },
        }));
    }

    setPointerInside(is_inside_app: boolean) {
        this.updateState((state) => ({
            ...state,
            cursor: {
                ...state.cursor,
                is_inside_app,
                last_updated_at: Date.now(),
            },
        }));
    }

    setOverlayMode(overlay_mode: GlobalState['focus']['overlay_mode']) {
        this.updateState((state) => ({
            ...state,
            focus: {
                ...state.focus,
                overlay_mode,
            },
        }));

        this.syncOverlayState({ mode: overlay_mode });
    }

    setFocusedWindow(focused_window_uid: string | null) {
        this.updateState((state) => ({
            ...state,
            focus: {
                ...state.focus,
                focused_window_uid,
            },
        }));

        this.syncOverlayState({ focused_window_uid });
    }

    setFocusedWidget(focused_widget_uid: string | null) {
        this.updateState((state) => ({
            ...state,
            focus: {
                ...state.focus,
                focused_widget_uid,
            },
        }));
    }

    setActiveElement(element: Element | null) {
        const active_element_tag = element?.tagName?.toLowerCase() ?? null;
        const active_element_role = element?.getAttribute('role') ?? null;

        this.updateState((state) => ({
            ...state,
            focus: {
                ...state.focus,
                active_element_tag,
                active_element_role,
            },
        }));
    }

    setActiveConfigItems(items: ConfigItem[]) {
        const mouseFocusConfig = items.find((item) => item.key === 'window.mouse_focus_enabled');
        const mouse_focus_enabled = typeof mouseFocusConfig?.value === 'boolean'
            ? mouseFocusConfig.value
            : true;

        this.updateState((state) => ({
            ...state,
            focus: {
                ...state.focus,
                mouse_focus_enabled,
            },
            runtime: {
                ...state.runtime,
                active_config_items: [...items],
                updated_at: Date.now(),
            },
        }));
    }

    setMouseFocusEnabled(mouse_focus_enabled: boolean) {
        this.updateState((state) => ({
            ...state,
            focus: {
                ...state.focus,
                mouse_focus_enabled,
            },
        }));
    }

    setActiveKeybinds(keybinds: Keybind[]) {
        this.updateState((state) => ({
            ...state,
            runtime: {
                ...state.runtime,
                active_keybinds: [...keybinds],
                updated_at: Date.now(),
            },
        }));
    }

    markKeybindRunning(keybind_uid: string) {
        this.updateState((state) => {
            const running_keybind_uids = state.runtime.running_keybind_uids.includes(keybind_uid)
                ? state.runtime.running_keybind_uids
                : [...state.runtime.running_keybind_uids, keybind_uid];

            return {
                ...state,
                runtime: {
                    ...state.runtime,
                    running_keybind_uids,
                    last_triggered_keybind_uid: keybind_uid,
                    updated_at: Date.now(),
                },
            };
        });
    }

    clearRunningKeybind(keybind_uid: string) {
        this.updateState((state) => ({
            ...state,
            runtime: {
                ...state.runtime,
                running_keybind_uids: state.runtime.running_keybind_uids.filter((uid) => uid !== keybind_uid),
                updated_at: Date.now(),
            },
        }));
    }

    replaceRunningKeybinds(keybind_uids: string[]) {
        this.updateState((state) => ({
            ...state,
            runtime: {
                ...state.runtime,
                running_keybind_uids: [...keybind_uids],
                updated_at: Date.now(),
            },
        }));
    }

    private updateState(updater: (state: GlobalState) => GlobalState) {
        const currentState = this.readState();
        const nextState = updater(currentState);

        Storage.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:global_state',
            payload: nextState,
            classifications: ['system:core'],
        });
    }

    private syncOverlayState(patch: Partial<GlobalOverlayState>) {
        const currentOverlay = Storage.readMemory('system:overlay_state') as GlobalOverlayState | undefined;
        if (!currentOverlay) return;

        Storage.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:overlay_state',
            payload: { ...currentOverlay, ...patch },
            classifications: ['system:core'],
        });
    }
}

export const GlobalStateManager = new GlobalStateManagerSingleton();
