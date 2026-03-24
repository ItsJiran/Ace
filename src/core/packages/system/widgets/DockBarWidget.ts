import type { AceRegistryType } from '#/schemas/registryTypes';

export const registry: AceRegistryType.Widget = {
    name: 'DockBar',
    slug: 'dock-bar',
    description: 'Polybar-style dock showing all open windows. Click to focus or restore minimized windows.',
    autostart: true,
    environment: ['prod', 'dev'],
};

export default function activate() {
    const screenW = typeof window !== 'undefined' ? window.innerWidth  : 1920;
    const screenH = typeof window !== 'undefined' ? window.innerHeight : 1080;

    const width  = 480;
    const height = 60;

    window.ACE.window.spawnWindow({
        package: 'itsjiran/ace-system',
        window:  'dock-bar-window',
        title:   'DockBar',
        width,
        height,
        x: Math.max(0, Math.round(screenW / 2 - width / 2)),
        y: Math.max(0, Math.round(screenH - height - 24)),
    });
}
