import type { AceRegistryType } from '#/schemas/registryTypes';

export const registry: AceRegistryType.Widget = {
    name: 'System Settings',
    slug: 'system-settings',
    entry_id: 'system_settings_activator',
    description: 'Manage packages, keybinds, and system configuration.',
    environment: ['prod', 'dev']
};

export default function activate() {
    window.ACE.window.spawnWindow({
        package: 'itsjiran/ace-system',
        window: 'system-settings-window',
        title: 'System Settings',
        width: 1000,
        height: 700
    });
}
