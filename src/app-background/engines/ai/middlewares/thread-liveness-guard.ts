import { ToolMessage } from '@langchain/core/messages';
import { createMiddleware } from 'langchain';

import { AIEngine } from '#/app-background/engines/ai-engine';
import type { AgentConfigType } from '#/shared/schemas/ai';
import { KernelEngine } from '#/shared/engines/kernel-engine';

const SYSTEM_INTERRUPT_MESSAGE = '[SYSTEM INTERRUPT]: User menghentikan process';

function resolveThreadUid(input: unknown): string | null {
	if (!input || typeof input !== 'object') {
		return null;
	}

	const configurable = (input as { configurable?: Record<string, unknown> }).configurable;
	if (!configurable || typeof configurable !== 'object') {
		return null;
	}

	return typeof configurable.thread_id === 'string' && configurable.thread_id.trim().length > 0
		? configurable.thread_id
		: null;
}

function isThreadStillExist(threadUid: string | null) {
	if (!threadUid) {
		return true;
	}

	return KernelEngine.readMemory(AIEngine.ai_threads_memory_uid(threadUid)) !== undefined;
}

function assertThreadStillExist(threadUid: string | null) {
	if (!isThreadStillExist(threadUid)) {
		throw new Error(SYSTEM_INTERRUPT_MESSAGE);
	}
}

export default createMiddleware({
	name: 'ThreadLivenessGuardMiddleware',
	beforeAgent: async (_state, runtime) => {
		const threadUid = resolveThreadUid(runtime as AgentConfigType);
		assertThreadStillExist(threadUid);
	},
	beforeModel: async (_state, runtime) => {
		const threadUid = resolveThreadUid(runtime as AgentConfigType);
		assertThreadStillExist(threadUid);
	},
	wrapToolCall: async (request, handler) => {
		const threadUid = resolveThreadUid(request.runtime as AgentConfigType);
		if (!isThreadStillExist(threadUid)) {
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