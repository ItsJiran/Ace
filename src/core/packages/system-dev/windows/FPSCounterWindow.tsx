import type { AceRegistryType } from '#/schemas/registryTypes';
import { AceWindow } from '#/components/layout/AceWindow';
import FPSCounter from '../components/FPSCounter';

export const registry: AceRegistryType.Window = {
    name: 'FPS Overlay Window',
    slug: 'fps-overlay',
    react_behavior: 'window_shell',
};

export default function FPSCounterWindow({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid}>
            <FPSCounter />
        </AceWindow>
    );
}
