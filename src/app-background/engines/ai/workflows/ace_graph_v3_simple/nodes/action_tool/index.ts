/**
 * Action: Tool — execute code, commands, install packages.
 * PENDING — under development.
 */

import { AIMessage } from '@langchain/core/messages';
import { Command, END, getConfig } from '@langchain/langgraph';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import { buildErrorRecoveryCommand } from '../recovery-error-helper';
import { writeActionOutput, writeActionResult } from '#/app-background/lib/utils/thread-storage';
import type { AceAgentV3State } from '../../types';

export function createActionTool() {
    return async function actionTool(state: AceAgentV3State): Promise<Partial<AceAgentV3State> | Command> {
        try {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action_tool', 'ace-v3', state).catch(() => {});

        if (threadUid && !KernelEngine.readMemory(`thread:active:${threadUid}`)) {
            return new Command({ goto: END });
        }

        const cycle = state.current_cycle;
        const actionPlan = cycle?.actions?.[0]?.thought ?? 'Execute tool.';

        const msg = `⏳ Action Tool sedang dalam tahap pengembangan. Rencana: "${actionPlan}". Silakan coba action lain atau akhiri sesi.`;

        // Write output & result pointers
        const cycleIndex = (state.cycles ?? []).length - 1;
        const runningActionIdx = cycle?.actions?.findIndex(a => a.status === 'running') ?? 0;
        const runningAction = runningActionIdx >= 0 ? cycle?.actions?.[runningActionIdx] : undefined;
        if (runningAction && threadUid) {
            runningAction.output = await writeActionOutput(threadUid, cycleIndex, runningActionIdx, { plan: actionPlan }).catch(() => '');
            runningAction.result = await writeActionResult(threadUid, cycleIndex, runningActionIdx, { msg }).catch(() => '');
        }

        const output: Partial<AceAgentV3State> = {
            messages: [new AIMessage({ content: msg, name: 'ace-v3-tool' })],
            current_cycle: cycle,
            target_node: 'thought',
            from_node: 'action_tool',
        };

        if (threadUid) emitNodeEnd(threadUid, 'action_tool', 'ace-v3', output).catch(() => {});
        return output;
        } catch (error) {
            console.error('[action_tool] Error:', error);
            return buildErrorRecoveryCommand(error, 'action_tool');
        }
    };
}
