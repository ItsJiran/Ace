import type { AceRegistryType } from '#/schemas/registryTypes';

export const registry: AceRegistryType.Widget = {
    widget_name: 'fps_counter',
    entry_id: 'fps_counter_main',
};

export default {
    component_name: 'fps_widget_window',
    window_profile: {
        window_name: 'fps_widget_window',
        default_window_preset: {
            component_name: 'fps_widget_window',
            width: 200,
            height: 100,
            title: 'FPS Counter',
            chrome_style: 'standard',
        },
    },
    launch_profile: {
        surfaces: ['hidden'],
    },
};
