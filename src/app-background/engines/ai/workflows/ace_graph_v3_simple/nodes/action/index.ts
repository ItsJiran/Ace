/**
 * Action Node — routes to the appropriate action sub-node based on
 * current_cycle.action.target.name.
 *
 * Supported targets: action_speak, action_tool, action_context, action_mcp.
 */

import { AIMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { emitNodeStart } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV3State } from '../../types';

const TARGET_MAP: Record<string, string> = {
    action_speak: 'action_speak',
    action_tool: 'action_tool',
    action_context: 'action_context',
    action_mcp: 'action_mcp',
};

export function createActionNode() {
    return async function actionNode(state: AceAgentV3State): Promise<Partial<AceAgentV3State>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action', 'ace-v3', state).catch(() => {});

        if (state.is_stopped) return { result_summary: 'Stopped.', from_node: 'action' };

        const cycle = state.current_cycle;
        if (!cycle) return { target_node: 'review', result_summary: 'No active cycle.', from_node: 'action' };

        const targetName = cycle.action.target.name;
        const subNode = TARGET_MAP[targetName] ?? 'action_speak'; // default: speak

        const output: Partial<AceAgentV3State> = {
            messages: [new AIMessage({
                content: `[${targetName}] ${cycle.action.thought.slice(0, 120)}`,
                name: 'ace-v3-action',
            })],
            target_node: subNode,
            from_node: 'action',
            result_summary: `Routing to ${subNode}`,
        };

        return output;
    };
}
