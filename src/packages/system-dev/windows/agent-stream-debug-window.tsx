import { AceWindow } from '#/app-desktop/components/layout/ace-window';
import { defineWindow } from '#/lib/define-registry';
import AgentStreamDebug from '../components/agent-stream-debug';

function AgentStreamDebugWindow({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid}>
            {({ close }) => {
                return <AgentStreamDebug close={close} />;
            }}
        </AceWindow>
    );
}

export default defineWindow(AgentStreamDebugWindow, {
    name: 'agent_stream_debug',
    slug: 'agent-stream-debug-window',
    icon_slug: 'activity',
    react_behavior: 'window_shell',
    default_config: {
        x: 150,
        y: 100,
        width: 520,
        height: 680,
        title: 'Agent Stream Debug',
        window_style: 'standard',
        is_locked: false,
        always_on_top: false,
    },
});
