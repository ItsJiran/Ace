import type { AceRegistryType } from '#/schemas/registryTypes';

export const registry: AceRegistryType.Widget = {
    widget_name: 'system_widget',
    entry_id: 'system_main',
};

export default {
    component_name: 'system_center_window',
    window_profile: {
        window_name: 'system_main_window',
        restoration_strategy: 'restore_state',
        default_window_preset: {
            component_name: 'system_center_window',
            width: 800,
            height: 600,
            chrome_style: 'standard',
        },
    },
    launch_profile: {
        surfaces: ['start_menu', 'command_palette'],
        launch_order: 10,
    },
};
