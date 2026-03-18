import type { AceRegistryType } from '#/schemas/registryTypes';

export const registry: AceRegistryType.Widget = {
    widget_name: 'dock_bar',
    entry_id: 'dock_bar_main',
};

export default {
    component_name: 'dock_bar_window',
    window_profile: {
        window_name: 'dock_bar_window',
        restoration_strategy: 'fresh',
        default_window_preset: {
            component_name: 'dock_bar_window',
            x: 800,
            y: 950,
            width: 320,
            height: 80,
            chrome_style: 'borderless',
            always_on_top: true,
        },
    },
    launch_profile: {
        surfaces: ['auto_start'],
        default_visibility: 'visible',
        startup_policy: 'always',
        launch_order: 100,
    },
};
