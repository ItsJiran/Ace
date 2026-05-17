import type { AceRegistryType } from '#/schemas/registry-types';

export const registry: AceRegistryType.Widget = {
    name: 'FPS Counter',
    slug: 'fps-counter',
    entry_id: 'fps_counter_activator',
    description: 'Displays a small FPS overlay.',
    autostart: true,
    environment: ['prod', 'dev']
};

export default function activate() {
    window.ACE.window.spawnWindow({
        package: 'itsjiran/ace-system-dev',
        window: 'fps-overlay',
        title: 'FPS',
        width: 70,
        height: 26,
        x: 10,
        y: 10,
        is_transparent: true,
        is_borderless: true,
        always_on_top: true,
        hide_ring: true
    });
}

