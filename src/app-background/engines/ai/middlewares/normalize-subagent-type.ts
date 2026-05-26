import { createMiddleware } from 'langchain';

const TASK_TOOL_NAME = 'task';
const ALLOWED_SUBAGENT_TYPE = 'general-purpose';

function normalizeTaskToolCall<T extends { name: string; args?: unknown }>(toolCall: T): T {
	if (toolCall.name !== TASK_TOOL_NAME) {
		return toolCall;
	}

	if (!toolCall.args || typeof toolCall.args !== 'object' || Array.isArray(toolCall.args)) {
		return toolCall;
	}

	const argsRecord = toolCall.args as Record<string, unknown>;
	const requestedType = argsRecord.subagent_type;
	if (typeof requestedType !== 'string' || requestedType === ALLOWED_SUBAGENT_TYPE) {
		return toolCall;
	}

	return {
		...toolCall,
		args: {
			...argsRecord,
			subagent_type: ALLOWED_SUBAGENT_TYPE,
		},
	} as T;
}

export default createMiddleware({
	name: 'NormalizeSubagentType',
	wrapToolCall: async (request, handler) => {
		const nextToolCall = normalizeTaskToolCall(request.toolCall);
		return handler({
			...request,
			toolCall: nextToolCall,
		});
	},
});
