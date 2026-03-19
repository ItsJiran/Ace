import type { AceRegistryType } from '#/schemas/registryTypes';
import { AceWindow } from '#/components/layout/AceWindow';
import type { WindowConfig } from '#/schemas/window';
import DevMenu from '../components/DevMenu';

export const registry: AceRegistryType.Window = {
    window_name: 'dev_menu',
    default_config: {
        component_name: 'dev_menu',
        x: 100,
        y: 100,
        width: 340,
        height: 600,
        title: 'Dev Kit',
        chrome_style: 'standard',
        is_locked: false,
        always_on_top: false,
    },
};

export default function DevKitWindow({ config }: { config: WindowConfig }) {
    return (
        <AceWindow config={config}>
            <DevMenu />
        </AceWindow>
    );
}

