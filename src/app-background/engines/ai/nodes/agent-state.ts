import type { BaseMessage } from '@langchain/core/messages';
import { Annotation } from '@langchain/langgraph';

const MAX_SHORT_TERM_MESSAGES = 8;

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