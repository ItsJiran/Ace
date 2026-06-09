/**
 * Interrupt Gate — calls LangGraph interrupt() to pause the graph.
 *
 * recovery_error routes here after adding the interrupt message to state.
 * The graph pauses, client renders InterruptBlock with Continue button.
 * On resume (ai.continueThreadPrompt → Command({ resume })), routes to thought.
 */

import { Command, getConfig, interrupt } from '@langchain/langgraph';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import { deserializeAgentError } from '#/shared/lib/agent-errors';
import type { RecoveryInterruptPayload } from '../recovery_error';
import type { AceAgentV3State } from '../../types';

export function createInterruptGate() {
    return async function interruptGate(
        state: AceAgentV3State,
    ): Promise<Partial<AceAgentV3State> | Command> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'interrupt_gate', 'ace-v3', state).catch(() => {});

        const err = deserializeAgentError(state.target_node_reason);

        const payload: RecoveryInterruptPayload = {
            type: 'recovery_interrupt',
            code: err.code,
            blockTag: 'network_interrupt_continue',
            message: err.message,
            node: err.node,
            actions: [{ id: 'continue', label: 'Continue' }],
        };

        // Pause — client sees the interrupt block and Continue button
        const resumeValue = interrupt(payload);
        void resumeValue;

        const output: Partial<AceAgentV3State> = {
            target_node: 'thought',
            target_node_reason: `Continuing from "${err.node}" after network recovery. Re-assess the current state and proceed.`,
            from_node: 'interrupt_gate',
        };

        if (threadUid)
            emitNodeEnd(threadUid, 'interrupt_gate', 'ace-v3', output).catch(() => {});

        return output;
    };
}
