import type { AceWindowRenderProps } from '#/hooks/useAceWindow';
import type { WindowConfig } from '#/schemas/window';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { AceWindow } from '#/components/layout/AceWindow';

import SystemAIChatbar from '../components/SystemAIChatbar';

export const registry: AceRegistryType.Window = {
    name: 'system_ai_chat_window',
    slug: 'system-ai-chat-window',
    icon_slug: 'message-square-text',
    react_behavior: 'window_shell',
    default_config: {
        x: 430,
        y: 100,
        width: 780,
        height: 660,
        title: 'ACE Chat',
        window_style: 'standard',
        is_locked: false,
        always_on_top: false,
    },
};

function SystemAIChatShell({
    config,
    isDragging,
    isFocused,
    close,
    minimize,
    dragHandleProps,
}: {
    config: WindowConfig;
    isDragging: boolean;
    isFocused: boolean;
    close: () => void;
    minimize: () => void;
    dragHandleProps: AceWindowRenderProps['dragHandleProps'];
}) {
    return (
        <div
            className={[
                'system-shell flex h-full w-full flex-col overflow-hidden rounded-[24px] pointer-events-auto',
                isFocused ? 'focused' : '',
                isDragging ? 'dragging focused' : '',
            ].join(' ')}
        >
            <div className="flex-1 overflow-hidden">
                <SystemAIChatbar
                    title={config.title}
                    dragHandleProps={dragHandleProps}
                    isFocused={isFocused}
                    isDragging={isDragging}
                    onClose={close}
                    onMinimize={minimize}
                />
            </div>
        </div>
    );
}

export default function SystemAIChatWindow({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid} headless>
            {({ windowConfig, dragHandleProps, isDragging, isFocused, close, minimize }) => {
                if (!windowConfig) return null;

                return (
                    <SystemAIChatShell
                        config={windowConfig}
                        isDragging={isDragging}
                        isFocused={isFocused}
                        close={close}
                        minimize={minimize}
                        dragHandleProps={dragHandleProps}
                    />
                );
            }}
        </AceWindow>
    );
}