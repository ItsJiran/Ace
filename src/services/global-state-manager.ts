import { KernelEngine } from './kernel-engine';
import type { CursorState, DesktopState, RuntimeState } from '#/schemas/global-state';
import type { ConfigItem } from '#/schemas/config';
import type { Keybind } from '#/schemas/keybinds';

const DEFAULT_CURSOR_STATE: CursorState = {
    x: 0,
    y: 0,
    is_pointer_down: false,
    is_inside_app: false,
    last_updated_at: Date.now(),
};

const DEFAULT_DESKTOP_STATE: DesktopState = {
    mode: 'ambient',
    window_display_mode: 'all_visible',
    mouse_x: 0,
    mouse_y: 0,
    debug_bg: false,
    is_overlay_locked: false,
    focused_widget_uid: null,
    active_element_tag: null,
    active_element_role: null,
};

const DEFAULT_RUNTIME_STATE: RuntimeState = {
    active_config_items: [],
    active_keybinds: [],
    running_keybind_uids: [],
    last_triggered_keybind_uid: null,
    updated_at: Date.now(),
};

class GlobalStateManagerSingleton {
    public readonly cursorStateUid = 'system:global_state:cursor';
    public readonly desktopStateUid = 'system:global_state:desktop';
    public readonly runtimeStateUid = 'system:global_state:runtime';
    public readonly mouseFocusMemoryUid = 'system:global_state:mouse_focus_enabled';
    public readonly focusedWindowMemoryUid = 'system:global_state:focused_window';
    public readonly activeWindowMemoryUid = 'system:global_state:active_window';

    setupKernelSpace() {
        KernelEngine.registerSystemMemory(this.cursorStateUid, DEFAULT_CURSOR_STATE);
        KernelEngine.registerSystemMemory(this.desktopStateUid, DEFAULT_DESKTOP_STATE);
        KernelEngine.registerSystemMemory(this.runtimeStateUid, DEFAULT_RUNTIME_STATE);
        KernelEngine.registerSystemMemory(this.mouseFocusMemoryUid, true);
        KernelEngine.registerSystemMemory(this.focusedWindowMemoryUid, null);
        KernelEngine.registerSystemMemory(this.activeWindowMemoryUid, null);
    }

    readCursorState(): CursorState {
        return (KernelEngine.readMemory(this.cursorStateUid) as CursorState | undefined) ?? DEFAULT_CURSOR_STATE;
    }

    readDesktopState(): DesktopState {
        return {
            ...DEFAULT_DESKTOP_STATE,
            ...((KernelEngine.readMemory(this.desktopStateUid) as Partial<DesktopState> | undefined) ?? {}),
        };
    }

    readRuntimeState(): RuntimeState {
        return (KernelEngine.readMemory(this.runtimeStateUid) as RuntimeState | undefined) ?? DEFAULT_RUNTIME_STATE;
    }

    readActiveWindow(): string | null {
        return (KernelEngine.readMemory(this.activeWindowMemoryUid) as string | null | undefined) ?? null;
    }

    setCursorPosition(x: number, y: number) {
        const state = this.readCursorState();
        if (state.x === x && state.y === y) return;

        KernelEngine.updateMemory(this.cursorStateUid, {
            ...state,
            x,
            y,
            last_updated_at: Date.now(),
        });
    }

    setPointerDown(is_pointer_down: boolean) {
        const state = this.readCursorState();
        if (state.is_pointer_down === is_pointer_down) return;

        KernelEngine.updateMemory(this.cursorStateUid, {
            ...state,
            is_pointer_down,
            last_updated_at: Date.now(),
        });
    }

    setPointerInside(is_inside_app: boolean) {
        const state = this.readCursorState();
        if (state.is_inside_app === is_inside_app) return;

        KernelEngine.updateMemory(this.cursorStateUid, {
            ...state,
            is_inside_app,
            last_updated_at: Date.now(),
        });
    }

    setOverlayMode(overlay_mode: DesktopState['mode']) {
        const state = this.readDesktopState();
        if (state.mode === overlay_mode) return;

        KernelEngine.updateMemory(this.desktopStateUid, {
            ...state,
            mode: overlay_mode,
        });
    }

    setWindowDisplayMode(window_display_mode: DesktopState['window_display_mode']) {
        const state = this.readDesktopState();
        if (state.window_display_mode === window_display_mode) return;

        KernelEngine.updateMemory(this.desktopStateUid, {
            ...state,
            window_display_mode,
        });
    }

    cycleWindowDisplayMode() {
        const orderedModes: DesktopState['window_display_mode'][] = [
            'all_visible',
            'active_and_focused_only',
            'all_semi_transparent',
            'all_transparent',
        ];
        const state = this.readDesktopState();
        const currentIndex = orderedModes.indexOf(state.window_display_mode);
        const nextMode = orderedModes[(currentIndex + 1 + orderedModes.length) % orderedModes.length];

        this.setWindowDisplayMode(nextMode);
    }

    setDebugBg(debug_bg: boolean) {
        const state = this.readDesktopState();
        if (state.debug_bg === debug_bg) return;

        KernelEngine.updateMemory(this.desktopStateUid, {
            ...state,
            debug_bg,
        });
    }

    toggleDebugBg() {
        const state = this.readDesktopState();
        this.setDebugBg(!state.debug_bg);
    }

    setOverlayLocked(is_overlay_locked: boolean) {
        const state = this.readDesktopState();
        if (state.is_overlay_locked === is_overlay_locked) return;

        KernelEngine.updateMemory(this.desktopStateUid, {
            ...state,
            is_overlay_locked,
        });
    }

    toggleOverlayLocked() {
        const state = this.readDesktopState();
        const nextLocked = !state.is_overlay_locked;

        this.setOverlayLocked(nextLocked);
        if (nextLocked) {
            this.setOverlayMode('interactive');
        }
    }

    setFocusedWindow(focused_window_uid: string | null) {
        const current = KernelEngine.readMemory(this.focusedWindowMemoryUid);
        if (current === focused_window_uid) return;

        KernelEngine.updateMemory(this.focusedWindowMemoryUid, focused_window_uid);
    }

    setActiveWindow(active_window_uid: string | null) {
        const current = KernelEngine.readMemory(this.activeWindowMemoryUid);
        if (current === active_window_uid) return;

        KernelEngine.updateMemory(this.activeWindowMemoryUid, active_window_uid);
    }

    setFocusedWindowInteractive(focused_window_uid: string) {
        const state = this.readDesktopState();
        const currentWindow = KernelEngine.readMemory(this.focusedWindowMemoryUid);

        if (state.mode !== 'interactive') {
            KernelEngine.updateMemory(this.desktopStateUid, {
                ...state,
                mode: 'interactive',
            });
        }

        if (currentWindow !== focused_window_uid) {
            KernelEngine.updateMemory(this.focusedWindowMemoryUid, focused_window_uid);
        }
    }

    setFocusedWidget(focused_widget_uid: string | null) {
        const state = this.readDesktopState();
        if (state.focused_widget_uid === focused_widget_uid) return;

        KernelEngine.updateMemory(this.desktopStateUid, {
            ...state,
            focused_widget_uid,
        });
    }

    setActiveElement(element: Element | null) {
        const active_element_tag = element?.tagName?.toLowerCase() ?? null;
        const active_element_role = element?.getAttribute('role') ?? null;

        const state = this.readDesktopState();
        if (
            state.active_element_tag === active_element_tag &&
            state.active_element_role === active_element_role
        ) {
            return;
        }

        KernelEngine.updateMemory(this.desktopStateUid, {
            ...state,
            active_element_tag,
            active_element_role,
        });
    }

    setActiveConfigItems(items: ConfigItem[]) {
        const mouseFocusConfig = items.find((item) => item.key === 'window.mouse_focus_enabled');
        const mouse_focus_enabled = typeof mouseFocusConfig?.value === 'boolean'
            ? mouseFocusConfig.value
            : true;

        const state = this.readRuntimeState();
        KernelEngine.updateMemory(this.runtimeStateUid, {
            ...state,
            active_config_items: [...items],
            updated_at: Date.now(),
        });

        const existing = KernelEngine.readMemory(this.mouseFocusMemoryUid);
        if (existing !== mouse_focus_enabled) {
            KernelEngine.updateMemory(this.mouseFocusMemoryUid, mouse_focus_enabled);
        }
    }

    setMouseFocusEnabled(mouse_focus_enabled: boolean) {
        const existing = KernelEngine.readMemory(this.mouseFocusMemoryUid);
        if (existing !== mouse_focus_enabled) {
            KernelEngine.updateMemory(this.mouseFocusMemoryUid, mouse_focus_enabled);
        }
    }

    setActiveKeybinds(keybinds: Keybind[]) {
        const state = this.readRuntimeState();
        KernelEngine.updateMemory(this.runtimeStateUid, {
            ...state,
            active_keybinds: [...keybinds],
            updated_at: Date.now(),
        });
    }

    markKeybindRunning(keybind_uid: string) {
        const state = this.readRuntimeState();
        const running_keybind_uids = state.running_keybind_uids.includes(keybind_uid)
            ? state.running_keybind_uids
            : [...state.running_keybind_uids, keybind_uid];

        KernelEngine.updateMemory(this.runtimeStateUid, {
            ...state,
            running_keybind_uids,
            last_triggered_keybind_uid: keybind_uid,
            updated_at: Date.now(),
        });
    }

    clearRunningKeybind(keybind_uid: string) {
        const state = this.readRuntimeState();
        KernelEngine.updateMemory(this.runtimeStateUid, {
            ...state,
            running_keybind_uids: state.running_keybind_uids.filter((uid) => uid !== keybind_uid),
            updated_at: Date.now(),
        });
    }

    replaceRunningKeybinds(keybind_uids: string[]) {
        const state = this.readRuntimeState();
        KernelEngine.updateMemory(this.runtimeStateUid, {
            ...state,
            running_keybind_uids: [...keybind_uids],
            updated_at: Date.now(),
        });
    }

    syncOverlayMouse(mouse_x: number, mouse_y: number) {
        const state = this.readDesktopState();
        if (state.mouse_x === mouse_x && state.mouse_y === mouse_y) {
            return;
        }

        KernelEngine.updateMemory(this.desktopStateUid, {
            ...state,
            mouse_x,
            mouse_y,
        });
    }
}

export const GlobalStateManager = new GlobalStateManagerSingleton();
