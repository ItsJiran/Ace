import type { AceRegistryType } from '#/schemas/registryTypes';

export const registry: AceRegistryType.Widget = {
    widget_name: 'fps_counter',
    entry_id: 'fps_counter_main',
    autostart: true,
    environment: ['dev']
};

export default function activate() {
    window.ACE.window.spawnWindow({
        component_name: 'fps_counter',
        title: 'FPS',
        chrome_style: 'borderless',
        always_on_top: true,
        width: 100,
        height: 60,
        x: 10,
        y: 10,
        hide_ring: true,
        is_locked: true,
        opacity: 0.8
    });
}

