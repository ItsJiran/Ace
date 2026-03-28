import type { AceRegistryType } from '#/schemas/registryTypes';

export const registry: AceRegistryType.Widget = {
    name: 'dev_menu',
    slug: 'dev-menu',
    entry_id: 'dev_menu_main',
    autostart: true,
    environment: ['dev']
};

/**
 * Widget logic: Spawns the Dev Menu window.
 */
export default function activate() {
    // Resolve default window configuration from registry
    // Use getDomainEntry to get metadata access
    const windowDef = window.ACE.registry.getDomainEntry('itsjiran/ace-system-dev', 'windows', 'dev-menu');
    const default_config = windowDef?.entry?.metadata?.default_config;

    window.ACE.window.spawnWindow({
        ...(default_config || {}),
        package: 'itsjiran/ace-system-dev',
        window: 'dev-menu',
        title: default_config?.title || 'Dev Kit',
        width: default_config?.width || 340,
        height: default_config?.height || 600
    });
}

