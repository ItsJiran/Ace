import type { ConfigItem } from '#/schemas/config';
import type { Keybind } from '#/schemas/keybinds';

/**
 * BASE CONFIGURATION ITEMS
 * These form the core system settings following the KV pattern.
 */
export const BASE_CONFIG_ITEMS: ConfigItem[] = [
    {
        key: 'core.theme',
        value: 'system',
        category: 'Appearance',
        description: 'The visual theme of the overlay (light, dark, or system).'
    },
    {
        key: 'core.overlay_opacity',
        value: 0.8,
        category: 'Appearance',
        description: 'The base opacity of the transparent layer containers.'
    },
    {
        key: 'core.always_on_top',
        value: true,
        category: 'Window',
        description: 'Whether the assistant stays above all other windows.'
    },
    {
        key: 'window.mouse_focus_enabled',
        value: true,
        category: 'Window',
        description: 'Whether mouse presence/click on a window is allowed to focus and activate that window. If disabled, windows remain transparent to mouse focus behavior.'
    },
    {
        key: 'core.debug_mode',
        value: false,
        category: 'Developer',
        description: 'Enable verbose logging and visual debug helpers.'
    }
];

/**
 * BASE KEYBINDINGS
 * Default shortcuts for core assistant functionality.
 */
export const BASE_KEYBINDS: Keybind[] = [
    {
        keybind_uid: 'core.toggle_overlay',
        shortcut: 'CommandOrControl+Shift+Space',
        description: 'Toggle between Ambient (Pass-through) and Interactive mode.',
        enabled: true,
        intent: {
            event_type: 'interaction',
            action: 'lookup',
            sub_action: 'toggle_overlay_mode',
            payload: {}
        }
    },
    {
        keybind_uid: 'window.cycle_display_mode',
        shortcut: 'CommandOrControl+Alt+D',
        description: 'Cycle desktop window display mode between visible, focused-only, semi-transparent, and transparent.',
        enabled: true,
        intent: {
            event_type: 'interaction',
            action: 'lookup',
            sub_action: 'cycle_window_display_mode',
            payload: {}
        }
    },
    {
        keybind_uid: 'window.toggle_mouse_focus',
        shortcut: 'CommandOrControl+Alt+M',
        description: 'Toggle mouse focus on/off for overlay windows.',
        enabled: true,
        intent: {
            event_type: 'interaction',
            action: 'lookup',
            sub_action: 'toggle_window_mouse_focus',
            payload: {}
        }
    },
    {
        keybind_uid: 'window.enable_mouse_focus',
        shortcut: 'CommandOrControl+Alt+Shift+F',
        description: 'Enable mouse focus so overlay windows can capture clicks and focus.',
        enabled: true,
        intent: {
            event_type: 'interaction',
            action: 'lookup',
            sub_action: 'set_window_mouse_focus',
            payload: {
                enabled: true
            }
        }
    },
    {
        keybind_uid: 'window.enable_mouse_focus_fallback',
        shortcut: 'CommandOrControl+Alt+2',
        description: 'Fallback: Enable mouse focus (for environments where Shift-combos are reserved).',
        enabled: true,
        intent: {
            event_type: 'interaction',
            action: 'lookup',
            sub_action: 'set_window_mouse_focus',
            payload: {
                enabled: true
            }
        }
    },
    {
        keybind_uid: 'window.disable_mouse_focus',
        shortcut: 'CommandOrControl+Alt+Shift+H',
        description: 'Disable mouse focus so overlay windows stay transparent and clicks pass through.',
        enabled: true,
        intent: {
            event_type: 'interaction',
            action: 'lookup',
            sub_action: 'set_window_mouse_focus',
            payload: {
                enabled: false
            }
        }
    },
    {
        keybind_uid: 'window.disable_mouse_focus_fallback',
        shortcut: 'CommandOrControl+Alt+1',
        description: 'Fallback: Disable mouse focus (for environments where Shift-combos are reserved).',
        enabled: true,
        intent: {
            event_type: 'interaction',
            action: 'lookup',
            sub_action: 'set_window_mouse_focus',
            payload: {
                enabled: false
            }
        }
    }
];
