import type { BaseMessage } from '@langchain/core/messages';
import { Annotation } from '@langchain/langgraph';
import type { AgentWorkflowStateType } from '#/shared/schemas/ai';

const MAX_SHORT_TERM_MESSAGES = 8;

export type AceAgentNodeStateType = {
	messages: BaseMessage[];
	goal_task?: string;
	executioner_task?: string;
};

export const AceAgentState = Annotation.Root({
	messages: Annotation<BaseMessage[]>({
		reducer: (_current, update) => update,
		default: () => [],
	}),
	goal_task: Annotation<string | undefined>({
		reducer: (current, update) =>
			typeof update === 'string' && update.trim() ? update.trim() : current,
		default: () => undefined,
	}),
	executioner_task: Annotation<string | undefined>({
		reducer: (current, update) =>
			typeof update === 'string' && update.trim() ? update.trim() : current,
		default: () => undefined,
	}),
});

export function trimWorkflowMessages(messages: BaseMessage[], maxMessages = MAX_SHORT_TERM_MESSAGES) {
	if (messages.length <= maxMessages) {
		return messages;
	}

	return messages.slice(-maxMessages);
}

export function resolveMessagesForNodeRun(messages: BaseMessage[]) {
	return trimWorkflowMessages(messages);
}

export function resolveWorkflowMessagesUpdate(
	currentMessages: BaseMessage[],
	nextMessages: BaseMessage[] | undefined,
) {
	if (!Array.isArray(nextMessages) || nextMessages.length === 0) {
		return trimWorkflowMessages(currentMessages);
	}

	return trimWorkflowMessages(nextMessages);
}

export function resolvePersistedAgentState(state: AceAgentNodeStateType): AgentWorkflowStateType {
	return {
		...state,
		messages: Array.isArray(state.messages) ? state.messages : [],
		goal_task:
			typeof state.goal_task === 'string' && state.goal_task.trim()
				? state.goal_task.trim()
				: undefined,
		executioner_task:
			typeof state.executioner_task === 'string' && state.executioner_task.trim()
				? state.executioner_task.trim()
				: undefined,
	};
}