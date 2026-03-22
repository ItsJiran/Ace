import type { AceRegistryType } from '#/schemas/registryTypes';

export const registry: AceRegistryType.Widget = {
    widget_name: 'package_registry_view',    slug: 'package-registry-view',    entry_id: 'package_registry_main',
};

export default {
    component_name: 'package_registry_view',
    window_profile: {
        window_name: 'package_registry_view_window',
        default_window_preset: {
            component_name: 'package_registry_view',
            width: 800,
            height: 600,
            title: 'Package Registry',
            chrome_style: 'standard',
        },
    },
    launch_profile: {
        surfaces: ['command_palette'],
    },
};
