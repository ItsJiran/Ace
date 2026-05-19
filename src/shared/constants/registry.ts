export const RegistryDomain = ['widgets', 'components', 'windows', 'tools', 'features', 'processes', 'pipelines', 'registries', 'renderers'] as const;
export type RegistryDomain = typeof RegistryDomain[number];

export const RegistryRuntimeMode = ['desktop', 'background'] as const;
export type RegistryRuntimeMode = typeof RegistryRuntimeMode[number];

export const RegistryRuntimeDomainMap: Record<RegistryRuntimeMode, readonly RegistryDomain[]> = {
	desktop: ['widgets', 'components', 'windows', 'renderers', 'features', 'registries'],
	background: ['widgets', 'tools', 'features', 'processes', 'pipelines', 'registries'],
};