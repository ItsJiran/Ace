import { ToolMessage } from '@langchain/core/messages';
import { createMiddleware } from 'langchain';

import type { AgentConfigType, AceAgentWorkflowState } from '#/shared/schemas/ai';

const SYSTEM_INTERRUPT_MESSAGE = '[SYSTEM INTERRUPT]: User menghentikan process';

function resolveThreadUid(input: unknown): string | null {
    if (!input || typeof input !== 'object') return null;

    const configurable = (input as { configurable?: Record<string, unknown> }).configurable;
    if (!configurable || typeof configurable !== 'object') return null;

    return typeof configurable.thread_id === 'string' && configurable.thread_id.trim().length > 0
        ? configurable.thread_id
        : null;
}

/**
 * Checks whether the workflow state has been flagged as interrupted.
 * This flag is injected via `graph.updateState(config, { is_interrupted: true }, "__root__")`
 * when the user calls stopThreadPrompt.
 */
function isThreadInterrupted(state: unknown): boolean {
    if (!state || typeof state !== 'object') return false;
    return (state as AceAgentWorkflowState).is_interrupted === true;
}

export default createMiddleware({
    name: 'ThreadLivenessGuardMiddleware',
    beforeAgent: async (state) => {
        if (isThreadInterrupted(state)) {
            throw new Error(SYSTEM_INTERRUPT_MESSAGE);
        }
    },
    beforeModel: async (state) => {
        if (isThreadInterrupted(state)) {
            throw new Error(SYSTEM_INTERRUPT_MESSAGE);
        }
    },
    wrapToolCall: async (request, handler) => {
        if (isThreadInterrupted(request.state)) {
            return new ToolMessage({
                content: SYSTEM_INTERRUPT_MESSAGE,
                tool_call_id: request.toolCall.id ?? 'system_interrupt',
                name: request.toolCall.name,
                status: 'error',
            });
        }

        return await handler(request);
    },
});