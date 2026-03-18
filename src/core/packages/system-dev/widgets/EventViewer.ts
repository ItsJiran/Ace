import type { AceRegistryType } from '#/schemas/registryTypes';

export const registry: AceRegistryType.Widget = {
    widget_name: 'event_viewer',
    entry_id: 'event_viewer_main',
};

export default {
    component_name: 'event_viewer_ui',
    window_profile: {
        window_name: 'event_viewer_window',
        default_window_preset: {
            component_name: 'event_viewer_ui',
            width: 620,
            height: 420,
            title: 'Event Viewer',
        },
    },
    launch_profile: {
        surfaces: ['command_palette'],
    },
};
