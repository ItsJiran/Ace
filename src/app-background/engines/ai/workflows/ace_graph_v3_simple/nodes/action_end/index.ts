/**
 * Action: End — gracefully terminate the agent run.
 *
 * This node produces a final summary message and routes to END.
 */

import { AIMessage } from '@langchain/core/messages';
import { Command, END, getConfig } from '@langchain/langgraph';
import { emitNodeStart } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV3State } from '../../types';

export function createActionEnd() {
    return async function actionEnd(state: AceAgentV3State): Promise<Partial<AceAgentV3State> | Command> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action_end', 'ace-v3', state).catch(() => {});

        const cycles = state.cycles ?? [];
        const lastCycle = cycles[cycles.length - 1];
        const lastReview = lastCycle?.action?.target?.reason
            ?? lastCycle?.action?.result as string | undefined
            ?? 'Request completed.';

        const output: Partial<AceAgentV3State> = {
            messages: [new AIMessage({
                content: `✅ ${lastReview}`,
                name: 'ace-v3-end',
            })],
            target_node: '__end__',
            from_node: 'action_end',
        };

        return output;
    };
}
