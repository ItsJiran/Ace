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
    const windowDef = window.ACE.registry.getDomainEntry('itsjiran/ace-system-dev', 'windows', 'dev_menu');
    const default_config = windowDef?.metadata?.default_config;

    window.ACE.window.spawnWindow(default_config || {
        component_name: 'dev_menu',
        title: 'Dev Kit (Fallback)',
        width: 320,
        height: 600
    });
}

