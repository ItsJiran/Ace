import type { AceRegistryType } from '#/schemas/registryTypes';

export const registry: AceRegistryType.Widget = {
    widget_name: 'system_dev_console',
    slug: 'system-dev-console',
    entry_id: 'system_dev_console_main',
};

export default {
    component_name: 'system_dev_console_window',
    window_profile: {
        window_name: 'system_dev_console_window',
        default_window_preset: {
            component_name: 'system_dev_console_window',
            width: 800,
            height: 600,
            title: 'System Dev Console',
            chrome_style: 'standard',
        },
    },
    launch_profile: {
        surfaces: ['command_palette'],
    },
};