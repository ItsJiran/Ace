/**
 * Action: Shell — execute shell commands.
 * PENDING — under development.
 */

import { AIMessage } from '@langchain/core/messages';
import { Command, END, getConfig } from '@langchain/langgraph';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import { buildErrorRecoveryCommand } from '../recovery-error-helper';
import { writeActionOutput, writeActionResult } from '#/app-background/lib/utils/thread-storage';
import { createContextTool, writeContextTool } from '#/app-background/lib/utils/context-storage';
import type { AceAgentV3State } from '../../types';

export function createActionShell() {
    return async function actionShell(state: AceAgentV3State): Promise<Partial<AceAgentV3State> | Command> {
        try {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action_shell', 'ace-v3', state).catch(() => {});

        if (threadUid && !KernelEngine.readMemory(`thread:active:${threadUid}`)) {
            return new Command({ goto: END });
        }

        const msg = '⏳ Action Shell sedang dalam tahap pengembangan.';

        // Write output & result pointers
        const cycleIndex = (state.cycles ?? []).length - 1;
        const runningActionIdx = state.current_cycle?.actions?.findIndex(a => a.status === 'running') ?? 0;
        const runningAction = runningActionIdx >= 0 ? state.current_cycle?.actions?.[runningActionIdx] : undefined;
        if (runningAction && threadUid) {
            runningAction.output = await writeActionOutput(threadUid, cycleIndex, runningActionIdx, { msg }).catch(() => '');
        }

        // Persist as tool context
        let toolContext = createContextTool(`shell-${runningActionIdx}-${Date.now()}`, `Shell: ${msg}`);
        if (threadUid) {
            toolContext = await writeContextTool(threadUid, toolContext, { payload: { plan: msg }, result: { msg } });
        }
        const updatedContexts = [...(state.contexts ?? []), toolContext];

        const output: Partial<AceAgentV3State> = {
            messages: [new AIMessage({ content: msg, name: 'ace-v3-shell' })],
            contexts: updatedContexts,
            current_cycle: state.current_cycle,
            target_node: 'thought',
            from_node: 'action_shell',
        };

        if (threadUid) emitNodeEnd(threadUid, 'action_shell', 'ace-v3', output).catch(() => {});
        return output;
        } catch (error) {
            console.error('[action_shell] Error:', error);
            return buildErrorRecoveryCommand(error, 'action_shell');
        }
    };
}
