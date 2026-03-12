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
    }
];
