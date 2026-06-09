/**
 * Action: Context — read files, inspect config, gather system info.
 * PENDING — under development.
 */

import { AIMessage } from '@langchain/core/messages';
import { Command, END, getConfig } from '@langchain/langgraph';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import { buildErrorRecoveryCommand } from '../recovery-error-helper';
import type { AceAgentV3State } from '../../types';

export function createActionContext() {
    return async function actionContext(state: AceAgentV3State): Promise<Partial<AceAgentV3State> | Command> {
        try {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action_context', 'ace-v3', state).catch(() => {});

        if (threadUid && !KernelEngine.readMemory(`thread:active:${threadUid}`)) {
            return new Command({ goto: END });
        }

        const cycle = state.current_cycle;
        const actionPlan = cycle?.action?.thought ?? 'Gather context.';

        const msg = `⏳ Action Context sedang dalam tahap pengembangan. Rencana: "${actionPlan}". Silakan coba action lain atau akhiri sesi.`;

        const output: Partial<AceAgentV3State> = {
            messages: [new AIMessage({ content: msg, name: 'ace-v3-context' })],
            target_node: 'thought',
            from_node: 'action_context',
        };

        if (threadUid) emitNodeEnd(threadUid, 'action_context', 'ace-v3', output).catch(() => {});
        return output;
        } catch (error) {
            console.error('[action_context] Error:', error);
            return buildErrorRecoveryCommand(error, 'action_context');
        }
    };
}
