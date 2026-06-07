/**
 * Action: MCP — Model Context Protocol integration.
 * STUB — not yet implemented.
 */

import { AIMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV3State } from '../../../types';

export function createActionMcp() {
    return async function actionMcp(state: AceAgentV3State): Promise<Partial<AceAgentV3State>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action_mcp', 'ace-v3', state).catch(() => {});

        if (state.is_stopped) return { result_summary: 'Stopped.', from_node: 'action_mcp' };

        const cycle = state.current_cycle;
        const actionThought = cycle?.action?.thought ?? 'Execute MCP action.';

        const output: Partial<AceAgentV3State> = {
            messages: [new AIMessage({ content: `[STUB] MCP: ${actionThought}`, name: 'ace-v3-mcp' })],
            target_node: 'review',
            from_node: 'action_mcp',
            result_summary: `[STUB] MCP executed: ${actionThought.slice(0, 100)}`,
        };

        if (threadUid) emitNodeEnd(threadUid, 'action_mcp', 'ace-v3', output).catch(() => {});
        return output;
    };
}
