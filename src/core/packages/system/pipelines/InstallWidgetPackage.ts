import type { AceRegistryType } from '#/schemas/registryTypes';

export const registry: AceRegistryType.Pipeline = {
    pipeline_name: 'install_widget_package',
    description: 'Multi-step pipeline for widget package installation.',
    step_names: ['fetch_manifest', 'validate', 'install', 'register'],
    cancellable: true,
};

// TODO: Export default pipeline class or factory when implemented
