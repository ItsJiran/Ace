import type { AceRegistryType } from '#/schemas/registryTypes';

export const registry: AceRegistryType.Widget = {
    widget_name: 'system_console',
    slug: 'system-console',
    entry_id: 'system_console_main',
};

export default {
    component_name: 'system_console_window',
    window_profile: {
        window_name: 'system_console_window',
        default_window_preset: {
            component_name: 'system_console_window',
            width: 600,
            height: 400,
            chrome_style: 'standard',
        },
    },
    launch_profile: {
        surfaces: ['start_menu', 'command_palette'],
        launch_order: 20,
    },
};
