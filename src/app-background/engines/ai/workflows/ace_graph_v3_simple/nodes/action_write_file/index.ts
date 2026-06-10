/**
 * Action: Write File — create or overwrite a file.
 * PENDING — under development.
 */

import { AIMessage } from '@langchain/core/messages';
import { Command, END, getConfig } from '@langchain/langgraph';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import { buildErrorRecoveryCommand } from '../recovery-error-helper';
import { writeActionOutput, writeActionResult } from '#/app-background/lib/utils/thread-storage';
import type { AceAgentV3State } from '../../types';

export function createActionWriteFile() {
    return async function actionWriteFile(state: AceAgentV3State): Promise<Partial<AceAgentV3State> | Command> {
        try {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action_write_file', 'ace-v3', state).catch(() => {});

        if (threadUid && !KernelEngine.readMemory(`thread:active:${threadUid}`)) {
            return new Command({ goto: END });
        }

        const msg = '⏳ Action Write File sedang dalam tahap pengembangan.';

        // Write output & result pointers
        const cycleIndex = (state.cycles ?? []).length - 1;
        const runningActionIdx = state.current_cycle?.actions?.findIndex(a => a.status === 'running') ?? 0;
        const runningAction = runningActionIdx >= 0 ? state.current_cycle?.actions?.[runningActionIdx] : undefined;
        if (runningAction && threadUid) {
            runningAction.output = await writeActionOutput(threadUid, cycleIndex, runningActionIdx, { msg }).catch(() => '');
        }

        const output: Partial<AceAgentV3State> = {
            messages: [new AIMessage({ content: msg, name: 'ace-v3-write-file' })],
            current_cycle: state.current_cycle,
            target_node: 'thought',
            from_node: 'action_write_file',
        };

        if (threadUid) emitNodeEnd(threadUid, 'action_write_file', 'ace-v3', output).catch(() => {});
        return output;
        } catch (error) {
            console.error('[action_write_file] Error:', error);
            return buildErrorRecoveryCommand(error, 'action_write_file');
        }
    };
}
