import type { AceRegistryType } from '#/schemas/registryTypes';

export const registry: AceRegistryType.Widget = {
    widget_name: 'dev_menu',
    entry_id: 'dev_menu_main',
};

export default {
    component_name: 'dev_menu',
    window_profile: {
        window_name: 'dev_menu',
        default_window_preset: {
            component_name: 'dev_menu',
            width: 320,
            height: 400,
            chrome_style: 'standard',
            title: 'Dev Menu',
        },
    },
    launch_profile: {
        surfaces: ['start_menu', 'command_palette'],
        launch_order: 999,
    },
};
