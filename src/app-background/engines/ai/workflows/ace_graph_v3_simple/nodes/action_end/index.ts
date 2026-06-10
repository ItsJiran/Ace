/**
 * Action: End — gracefully terminate the agent run.
 *
 * This node produces a final summary message and routes to END.
 */

import { AIMessage } from '@langchain/core/messages';
import { Command, END, getConfig } from '@langchain/langgraph';
import { emitNodeStart } from '#/app-background/lib/utils/ai/emit-graph-event';
import { buildErrorRecoveryCommand } from '../recovery-error-helper';
import type { AceAgentV3State } from '../../types';

export function createActionEnd() {
    return async function actionEnd(state: AceAgentV3State): Promise<Partial<AceAgentV3State> | Command> {
        try {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action_end', 'ace-v3', state).catch(() => {});

        const cycles = state.cycles ?? [];
        const lastCycle = cycles[cycles.length - 1];
        const lastAction = lastCycle?.actions?.[lastCycle.actions.length - 1];
        const lastReview = lastAction?.target?.reason
            ?? lastAction?.result as string | undefined
            ?? 'Request completed.';

        const output: Partial<AceAgentV3State> = {
            target_node: '__end__',
            from_node: 'action_end',
        };

        return output;
        } catch (error) {
            console.error('[action_end] Error:', error);
            return buildErrorRecoveryCommand(error, 'action_end');
        }
    };
}
