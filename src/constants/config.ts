import type { ConfigItem, ConfigItemKeybind, ConfigStorage } from '#/schemas/config';
import { KeybindActionMap, KeybindButtonCodeMap, KeybindCodes, KeybindButtons } from './keybinds';

/**
 * Default general configuration
 * These are the default configuration items that will be loaded into the system. Users can customize these through the UI,
 * and changes will be persisted to ace.config.json. The configuration includes theme settings, window behavior, and debug options.
 */

export const DefaultConfigGeneral: ConfigStorage<ConfigItem> = {
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
            description: 'Whether mouse presence/click on a window is allowed to focus and activate that window. If disabled, windows remain transparent to mouse focus behavior.',
        },
    ],
};

/**
 * Default keybinds configuration
 * These are the default keybinds that will be loaded into the system. Users can customize these through the UI,
 * and changes will be persisted to ace.keybinds.json. The keybinds include toggling overlay modes, cycling display modes,
 * and managing mouse focus for overlay windows. Each keybind is associated with an interaction intent that the system
 * listens for to trigger the corresponding action.
 */

export const DefaultConfigKeybinds: ConfigStorage<ConfigItemKeybind> = {
    memory_uid: 'system:keybinds',
    file_name: 'ace.keybinds.json',
    items: [
        
        /**
         * Toggle overlay mode
         */
        {
            key: KeybindActionMap.toggleOverlayMode,
            value: [KeybindButtons.ControlLeft, KeybindButtons.AltLeft, KeybindButtons.Backslash],
            description: 'Toggle between Ambient (Pass-through) and Interactive mode.',
        },

        /**
         * Cycle display mode
         */
        {
            key: KeybindActionMap.cycleDisplayMode,
            value: [KeybindButtons.ControlLeft, KeybindButtons.AltLeft, KeybindButtons.KeyD],
            description: 'Cycle desktop window display mode between visible, focused-only, semi-transparent, and transparent.',
        },
    ],
};
