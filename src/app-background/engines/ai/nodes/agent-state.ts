import type { BaseMessage } from '@langchain/core/messages';
import { Annotation } from '@langchain/langgraph';
import type { AgentWorkflowStateType } from '#/shared/schemas/ai';

const MAX_SHORT_TERM_MESSAGES = 8;

export type AceAgentNodeStateType = {
	messages: BaseMessage[];
};

export const AceAgentState = Annotation.Root({
	messages: Annotation<BaseMessage[]>({
		reducer: (_current, update) => update,
		default: () => [],
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
	};
}