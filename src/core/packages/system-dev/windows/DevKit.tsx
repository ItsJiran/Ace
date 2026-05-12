import type { AceRegistryType } from '#/schemas/registryTypes';
import { AceWindow } from '#/components/layout/AceWindow';
import DevMenu from '../components/DevMenu';

export const registry: AceRegistryType.Window = {
    name: 'dev_menu',
    slug: 'dev-menu',
    icon_slug: 'sparkles',
    react_behavior: 'window_shell',
    default_config: {
        x: 100,
        y: 100,
        width: 340,
        height: 600,
        title: 'Dev Kit',
        window_style: 'standard',
        is_locked: false,
        always_on_top: false,
    },
};

export default function DevKitWindow({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid}>
            <DevMenu />
        </AceWindow>
    );
}

