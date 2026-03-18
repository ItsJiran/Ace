import type { AceRegistryType } from '#/schemas/registryTypes';

export const registry: AceRegistryType.Pipeline = {
    pipeline_name: 'install_tool_package',
    description: 'Multi-step pipeline for tool package installation.',
    step_names: ['fetch_manifest', 'validate', 'install', 'register'],
    cancellable: true,
};

// TODO: Export default pipeline class or factory when implemented
