import { AceWindow } from '#/app-desktop/components/layout/ace-window';
import { defineWindow } from '#/lib/define-registry';
import AgentGraphDebug from '../components/agent-graph-debug';

function AgentGraphDebugWindow({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid}>
            {({ close }) => {
                return <AgentGraphDebug close={close} />;
            }}
        </AceWindow>
    );
}

export default defineWindow(AgentGraphDebugWindow, {
    name: 'agent_graph_debug',
    slug: 'agent-graph-debug-window',
    icon_slug: 'git-branch',
    react_behavior: 'window_shell',
    default_config: {
        x: 700,
        y: 100,
        width: 640,
        height: 720,
        title: 'Agent Graph Debug',
        window_style: 'standard',
        is_locked: false,
        always_on_top: false,
    },
});
