import { AceWindow } from '#/app-desktop/components/layout/ace-window';
import { defineWindow } from '#/lib/define-registry';
import DevMenu from '../components/dev-menu';

function DevKitWindow({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid}>
            {({ windowConfig, close }) => {
                if (!windowConfig) return null;

                return <DevMenu close={close} />;
            }}
        </AceWindow>
    );
}

export default defineWindow(DevKitWindow, {
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
});
