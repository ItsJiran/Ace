import type { AceRegistryType } from '#/schemas/registry-types';
import { AceWindow } from '#/components/layout/ace-window';
import FPSCounter from '../components/fps-counter';

export const registry: AceRegistryType.Window = {
    name: 'FPS Overlay Window',
    slug: 'fps-overlay',
    react_behavior: 'window_shell',
};

export default function FPSCounterWindow({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid} headless>
            {({ dragHandleProps }) => (
                <div {...dragHandleProps} className="w-full h-full cursor-grab active:cursor-grabbing">
                    <FPSCounter />
                </div>
            )}
        </AceWindow>
    );
}
