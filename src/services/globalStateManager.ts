import { StorageEngine } from './storageEngine';
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

const MOUSE_FOCUS_MEMORY_UID = 'system:mouse_focus_enabled';
const FOCUSED_WINDOW_MEMORY_UID = 'system:focused_window_uid';

class GlobalStateManagerSingleton {
    constructor() {
        const existing = StorageEngine.readMemory('system:global_state');
        if (!existing) {
            StorageEngine.dispatchRAMAction({
                action: 'create_memory',
                memory_uid: 'system:global_state',
                payload: DEFAULT_GLOBAL_STATE,
                classifications: ['system:core'],
            });
        }

        const mouseFocusExisting = StorageEngine.readMemory(MOUSE_FOCUS_MEMORY_UID);
        if (typeof mouseFocusExisting !== 'boolean') {
            StorageEngine.dispatchRAMAction({
                action: 'create_memory',
                memory_uid: MOUSE_FOCUS_MEMORY_UID,
                payload: true,
                classifications: ['system:core'],
            });
        }

        const focusedWindowExisting = StorageEngine.readMemory(FOCUSED_WINDOW_MEMORY_UID);
        if (typeof focusedWindowExisting !== 'string' && focusedWindowExisting !== null) {
            StorageEngine.dispatchRAMAction({
                action: 'create_memory',
                memory_uid: FOCUSED_WINDOW_MEMORY_UID,
                payload: null,
                classifications: ['system:core'],
            });
        }
    }

    readState() {
        return (StorageEngine.readMemory('system:global_state') as GlobalState | undefined) ?? DEFAULT_GLOBAL_STATE;
    }

    setCursorPosition(x: number, y: number) {
        const state = this.readState();
        if (state.cursor.x === x && state.cursor.y === y) {
            return;
        }

        this.updateState((state) => ({
            ...state,
            cursor: {
                ...state.cursor,
                x,
                y,
                last_updated_at: Date.now(),
            },
        }));
    }

    setPointerDown(is_pointer_down: boolean) {
        const state = this.readState();
        if (state.cursor.is_pointer_down === is_pointer_down) {
            return;
        }

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
        const state = this.readState();
        if (state.cursor.is_inside_app === is_inside_app) {
            return;
        }

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
        const state = this.readState();
        if (state.focus.overlay_mode === overlay_mode) {
            return;
        }

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
        const state = this.readState();
        if (state.focus.focused_window_uid === focused_window_uid) {
            return;
        }

        this.updateState((state) => ({
            ...state,
            focus: {
                ...state.focus,
                focused_window_uid,
            },
        }));

        this.syncOverlayState({ focused_window_uid });

        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: FOCUSED_WINDOW_MEMORY_UID,
            payload: focused_window_uid,
            classifications: ['system:core'],
        });
    }

    /**
     * Atomically sets focused window + interactive overlay mode in a single pass.
     * Replaces calling setFocusedWindow() + setOverlayMode() separately, which
     * would write system:global_state and system:overlay_state twice each.
     */
    setFocusedWindowInteractive(focused_window_uid: string) {
        const state = this.readState();
        const alreadyFocused = state.focus.focused_window_uid === focused_window_uid;
        const alreadyInteractive = state.focus.overlay_mode === 'interactive';

        if (alreadyFocused && alreadyInteractive) return;

        // Single updateState → one write to system:global_state
        this.updateState((s) => ({
            ...s,
            focus: {
                ...s.focus,
                focused_window_uid,
                overlay_mode: 'interactive',
            },
        }));

        // Single syncOverlayState → one write to system:overlay_state
        this.syncOverlayState({ focused_window_uid, mode: 'interactive' });

        // Separate write for consumers that subscribe only to this key
        if (!alreadyFocused) {
            StorageEngine.dispatchRAMAction({
                action: 'create_memory',
                memory_uid: FOCUSED_WINDOW_MEMORY_UID,
                payload: focused_window_uid,
                classifications: ['system:core'],
            });
        }
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

        const state = this.readState();
        if (
            state.focus.active_element_tag === active_element_tag &&
            state.focus.active_element_role === active_element_role
        ) {
            return;
        }

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

        const existing = StorageEngine.readMemory(MOUSE_FOCUS_MEMORY_UID);
        if (existing !== mouse_focus_enabled) {
            StorageEngine.dispatchRAMAction({
                action: 'create_memory',
                memory_uid: MOUSE_FOCUS_MEMORY_UID,
                payload: mouse_focus_enabled,
                classifications: ['system:core'],
            });
        }
    }

    setMouseFocusEnabled(mouse_focus_enabled: boolean) {
        const state = this.readState();
        if (state.focus.mouse_focus_enabled === mouse_focus_enabled) {
            return;
        }

        this.updateState((state) => ({
            ...state,
            focus: {
                ...state.focus,
                mouse_focus_enabled,
            },
        }));

        const existing = StorageEngine.readMemory(MOUSE_FOCUS_MEMORY_UID);
        if (existing !== mouse_focus_enabled) {
            StorageEngine.dispatchRAMAction({
                action: 'create_memory',
                memory_uid: MOUSE_FOCUS_MEMORY_UID,
                payload: mouse_focus_enabled,
                classifications: ['system:core'],
            });
        }
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

        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:global_state',
            payload: nextState,
            classifications: ['system:core'],
        });
    }

    private syncOverlayState(patch: Partial<GlobalOverlayState>) {
        const currentOverlay = StorageEngine.readMemory('system:overlay_state') as GlobalOverlayState | undefined;
        if (!currentOverlay) return;

        const hasActualChange = Object.entries(patch).some(([key, value]) => {
            return (currentOverlay as any)[key] !== value;
        });
        if (!hasActualChange) {
            return;
        }

        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:overlay_state',
            payload: { ...currentOverlay, ...patch },
            classifications: ['system:core'],
        });
    }
}

export const GlobalStateManager = new GlobalStateManagerSingleton();
