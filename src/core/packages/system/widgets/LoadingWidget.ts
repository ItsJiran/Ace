import type { AceRegistryType } from '#/schemas/registryTypes';

export const registry: AceRegistryType.Widget = {
    widget_name: 'loading_widget',
    entry_id: 'loading_main',
};

export default {
    component_name: 'loading_widget',
    launch_profile: {
        surfaces: ['hidden'],
        launch_order: 0,
    },
};
