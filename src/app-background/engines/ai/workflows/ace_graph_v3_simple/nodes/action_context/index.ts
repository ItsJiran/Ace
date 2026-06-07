/**
 * Action: Context — gather information (read files, check config, etc.).
 * STUB — not yet implemented.
 */

import { AIMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV3State } from '../../../types';

export function createActionContext() {
    return async function actionContext(state: AceAgentV3State): Promise<Partial<AceAgentV3State>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action_context', 'ace-v3', state).catch(() => {});

        if (state.is_stopped) return { result_summary: 'Stopped.', from_node: 'action_context' };

        const cycle = state.current_cycle;
        const actionThought = cycle?.action?.thought ?? 'Gather context.';

        const output: Partial<AceAgentV3State> = {
            messages: [new AIMessage({ content: `[STUB] Context: ${actionThought}`, name: 'ace-v3-context' })],
            target_node: 'review',
            from_node: 'action_context',
            result_summary: `[STUB] Context gathered: ${actionThought.slice(0, 100)}`,
        };

        if (threadUid) emitNodeEnd(threadUid, 'action_context', 'ace-v3', output).catch(() => {});
        return output;
    };
}
