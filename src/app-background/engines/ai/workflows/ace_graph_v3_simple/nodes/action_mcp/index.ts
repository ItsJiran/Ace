/**
 * Action: MCP — Model Context Protocol integration.
 * PENDING — under development.
 */

import { AIMessage } from '@langchain/core/messages';
import { Command, END, getConfig } from '@langchain/langgraph';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import { buildErrorRecoveryCommand } from '../recovery-error-helper';
import { writeActionOutput, writeActionResult } from '#/app-background/lib/utils/thread-storage';
import type { AceAgentV3State } from '../../types';

export function createActionMcp() {
    return async function actionMcp(state: AceAgentV3State): Promise<Partial<AceAgentV3State> | Command> {
        try {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action_mcp', 'ace-v3', state).catch(() => {});

        if (threadUid && !KernelEngine.readMemory(`thread:active:${threadUid}`)) {
            return new Command({ goto: END });
        }

        const cycle = state.current_cycle;
        const actionPlan = cycle?.actions?.[0]?.thought ?? 'Execute MCP action.';

        const msg = `⏳ Action MCP sedang dalam tahap pengembangan. Rencana: "${actionPlan}". Silakan coba action lain atau akhiri sesi.`;

        // Write output & result pointers
        const cycleIndex = (state.cycles ?? []).length - 1;
        const runningActionIdx = cycle?.actions?.findIndex(a => a.status === 'running') ?? 0;
        const runningAction = runningActionIdx >= 0 ? cycle?.actions?.[runningActionIdx] : undefined;
        if (runningAction && threadUid) {
            runningAction.output = await writeActionOutput(threadUid, cycleIndex, runningActionIdx, { plan: actionPlan }).catch(() => '');
            runningAction.result = await writeActionResult(threadUid, cycleIndex, runningActionIdx, { msg }).catch(() => '');
        }

        const output: Partial<AceAgentV3State> = {
            messages: [new AIMessage({ content: msg, name: 'ace-v3-mcp' })],
            current_cycle: cycle,
            target_node: 'thought',
            from_node: 'action_mcp',
        };

        if (threadUid) emitNodeEnd(threadUid, 'action_mcp', 'ace-v3', output).catch(() => {});
        return output;
        } catch (error) {
            console.error('[action_mcp] Error:', error);
            return buildErrorRecoveryCommand(error, 'action_mcp');
        }
    };
}
