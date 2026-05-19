import { AceWindow } from '#/app-desktop/components/layout/ace-window';
import { defineWindow } from '#/lib/define-registry';

import SystemDockbar from '../components/system-dockbar';

function SystemDockbarWindow({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid} headless>
            {({
                windowConfig,
                resolveWindowStateClass,
                isDragging,
                isFocused,
                dragHandleProps,
            }) => {
                if (!windowConfig) {
                    return null;
                }

                const windowStateClass = resolveWindowStateClass();
                const isWindowStateActive = windowStateClass === 'active';

                return (
                    <div
                        className={[
                            'system-shell flex h-full w-full flex-col rounded-[24px] pointer-events-auto',
                            windowStateClass,
                            isDragging ? 'dragging active overflow-visible' : 'overflow-visible',
                        ]
                            .filter(Boolean)
                            .join(' ')}
                    >
                        <SystemDockbar dragHandleProps={dragHandleProps} />
                    </div>
                );
            }}
        </AceWindow>
    );
}

export default defineWindow(SystemDockbarWindow, {
    name: 'system_dockbar_window',
    slug: 'system-dockbar-window',
    icon_slug: 'panel-bottom-open',
    react_behavior: 'window_shell',
    default_config: {
        x: 240,
        y: 920,
        width: 980,
        height: 92,
        title: 'Dockbar',
        window_style: 'borderless',
        is_locked: false,
        is_resizeable: false,
        always_on_top: true,
        opacity: 1,
    },
});
