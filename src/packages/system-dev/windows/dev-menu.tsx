import type { AceRegistryType } from '#/shared/schemas/registry-types';
import { AceWindow } from '#/app-desktop/components/layout/ace-window';
import DevMenu from '../components/dev-menu';

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
            {({ windowConfig, dragHandleProps, isDragging, isFocused, close, minimize, resolveWindowStateClass }) => {
                if (!windowConfig) return null;

                const windowStateClass = resolveWindowStateClass();
                const isWindowStateActive = windowStateClass === 'active';

                return <DevMenu close={close} />;
            }}
        </AceWindow>
    );
}
