import type { ConfigStorage } from '#/schemas/config';

/** 
 * Default general configuration
 * These are the default configuration items that will be loaded into the system. Users can customize these through the UI, 
 * and changes will be persisted to ace.config.json. The configuration includes theme settings, window behavior, and debug options.
*/

export const DefaultConfigGeneral : ConfigStorage = {
    memory_uid: 'system:general_config',
    file_name: 'ace.config.json',
    items: [
        {
            key: 'core.theme',
            value: 'system',
            category: 'Appearance',
            description: 'The visual theme of the overlay (light, dark, or system).',
        },
        {
            key: 'core.overlay_opacity',
            value: 0.8,
            category: 'Appearance',
            description: 'The base opacity of the transparent layer containers.',
        },
        {
            key: 'core.always_on_top',
            value: true,
            category: 'Window',
            description: 'Whether the assistant stays above all other windows.',
        },
        {
            key: 'core.debug_mode',
            value: false,
            category: 'Developer',
            description: 'Enable verbose logging and visual debug helpers.',
        },
        {
            key: 'window.mouse_focus_enabled',
            value: true,
            category: 'Window',
            description:
                'Whether mouse presence/click on a window is allowed to focus and activate that window. If disabled, windows remain transparent to mouse focus behavior.',
        },
    ]
}

/** 
 * Default keybinds configuration 
 * These are the default keybinds that will be loaded into the system. Users can customize these through the UI, 
 * and changes will be persisted to ace.keybinds.json. The keybinds include toggling overlay modes, cycling display modes, 
 * and managing mouse focus for overlay windows. Each keybind is associated with an interaction intent that the system 
 * listens for to trigger the corresponding action.
*/

export const DefaultConfigKeybinds: ConfigStorage = {
    memory_uid: 'system:keybinds',
    file_name: 'ace.keybinds.json',
    items: [
        {
            key: 'keybinds.toggle_overlay',
            value: 'CommandOrControl+Shift+Space',
            description: 'Toggle between Ambient (Pass-through) and Interactive mode.',
            intent: {
                event_type: 'interaction',
                action: 'lookup',
                sub_action: 'toggle_overlay_mode',
                payload: {},
            },
        },
        {
            key: 'keybinds.cycle_display_mode',
            value: 'CommandOrControl+Alt+D',
            description:
                'Cycle desktop window display mode between visible, focused-only, semi-transparent, and transparent.',
            intent: {
                event_type: 'interaction',
                action: 'lookup',
                sub_action: 'cycle_window_display_mode',
                payload: {},
            },
        },
        {
            key: 'keybinds.toggle_mouse_focus',
            value: 'CommandOrControl+Alt+M',
            description: 'Toggle mouse focus on/off for overlay windows.',
            intent: {
                event_type: 'interaction',
                action: 'lookup',
                sub_action: 'toggle_window_mouse_focus',
                payload: {},
            },
        },
        {
            key: 'keybinds.enable_mouse_focus',
            value: 'CommandOrControl+Alt+Shift+F',
            description: 'Enable mouse focus so overlay windows can capture clicks and focus.',
            intent: {
                event_type: 'interaction',
                action: 'lookup',
                sub_action: 'set_window_mouse_focus',
                payload: {
                    enabled: true,
                },
            },
        },
        {
            key: 'keybinds.enable_mouse_focus_fallback',
            value: 'CommandOrControl+Alt+2',
            description:
                'Fallback: Enable mouse focus (for environments where Shift-combos are reserved).',
            intent: {
                event_type: 'interaction',
                action: 'lookup',
                sub_action: 'set_window_mouse_focus',
                payload: {
                    enabled: true,
                },
            },
        },
        {
            key: 'keybinds.disable_mouse_focus',
            value: 'CommandOrControl+Alt+Shift+H',
            description:
                'Disable mouse focus so overlay windows stay transparent and clicks pass through.',
            intent: {
                event_type: 'interaction',
                action: 'lookup',
                sub_action: 'set_window_mouse_focus',
                payload: {
                    enabled: false,
                },
            },
        },
        {
            key: 'keybinds.disable_mouse_focus_fallback',
            value: 'CommandOrControl+Alt+1',
            description:
                'Fallback: Disable mouse focus (for environments where Shift-combos are reserved).',
            intent: {
                event_type: 'interaction',
                action: 'lookup',
                sub_action: 'set_window_mouse_focus',
                payload: {},
            },
        },
    ],
};
