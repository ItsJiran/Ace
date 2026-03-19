import { AceWindow } from '#/components/layout/AceWindow';
import FPSCounter from '../components/FPSCounter';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { WindowConfig } from '#/schemas/window';

export const registry: AceRegistryType.Window = {
    window_name: 'fps_counter',
    default_config: {
        component_name: 'fps_counter',
        title: 'FPS',
        x: 10,
        y: 10,
        width: 100,
        height: 60,
        chrome_style: 'standard', // Use standard to allow dragging
        always_on_top: true,
        is_locked: false,
        opacity: 0.8,
        hide_ring: true
    }
};

export default function FPSWindow({ config }: { config: WindowConfig }) {
    return (
        <AceWindow config={config}>
            <div className="w-full h-full flex items-center justify-center text-xs font-mono text-green-400 bg-black/50 rounded pointer-events-none select-none">
                <div className="pointer-events-auto">
                    <FPSCounter />
                </div>
            </div>
        </AceWindow>
    );
}

