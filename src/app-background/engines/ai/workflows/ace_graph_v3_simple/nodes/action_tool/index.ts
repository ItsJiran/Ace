/**
 * Action: Tool — execute a concrete action (write code, run command, etc.).
 * STUB — not yet implemented.
 */

import { AIMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV3State } from '../../../types';

export function createActionTool() {
    return async function actionTool(state: AceAgentV3State): Promise<Partial<AceAgentV3State>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action_tool', 'ace-v3', state).catch(() => {});

        if (state.is_stopped) return { result_summary: 'Stopped.', from_node: 'action_tool' };

        const cycle = state.current_cycle;
        const actionThought = cycle?.action?.thought ?? 'Execute tool action.';

        const output: Partial<AceAgentV3State> = {
            messages: [new AIMessage({ content: `[STUB] Tool: ${actionThought}`, name: 'ace-v3-tool' })],
            target_node: 'review',
            from_node: 'action_tool',
            result_summary: `[STUB] Tool executed: ${actionThought.slice(0, 100)}`,
        };

        if (threadUid) emitNodeEnd(threadUid, 'action_tool', 'ace-v3', output).catch(() => {});
        return output;
    };
}
