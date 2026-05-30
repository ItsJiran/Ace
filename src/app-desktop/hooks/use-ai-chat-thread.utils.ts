import { BaseMessage, HumanMessage, coerceMessageLikeToMessage } from '@langchain/core/messages';
import type { BaseMessageLike } from '@langchain/core/messages';
import type { AgentThread } from '#/shared/schemas/ai';

export function resolveStoredMessageType(input: Record<string, unknown>): string | null {
	const directType = typeof input.type === 'string' ? input.type : null;
	if (directType) {
		return directType;
	}

	const roleType = typeof input.role === 'string' ? input.role : null;
	if (roleType) {
		return roleType;
	}

	const kwargs = input.kwargs;
	if (kwargs && typeof kwargs === 'object' && typeof (kwargs as Record<string, unknown>).type === 'string') {
		return (kwargs as Record<string, unknown>).type as string;
	}

	const lcKwargs = input.lc_kwargs;
	if (
		lcKwargs &&
		typeof lcKwargs === 'object' &&
		typeof (lcKwargs as Record<string, unknown>).type === 'string'
	) {
		return (lcKwargs as Record<string, unknown>).type as string;
	}

	return null;
}

export function coerceStoredMessage(input: unknown): BaseMessage {
	if (!input || typeof input !== 'object') {
		return new HumanMessage(typeof input === 'string' ? input : '');
	}

	if (BaseMessage.isInstance(input)) {
		return input;
	}

	const record = input as Record<string, unknown>;
	const normalizedType = resolveStoredMessageType(record);
	const normalizedRecord = {
		...(record.lc_kwargs && typeof record.lc_kwargs === 'object'
			? (record.lc_kwargs as Record<string, unknown>)
			: record.kwargs && typeof record.kwargs === 'object'
				? (record.kwargs as Record<string, unknown>)
				: record),
		...record,
		...(normalizedType ? { type: normalizedType } : {}),
	};

	try {
		const messageRecord = normalizedRecord as Record<string, unknown>;
		const messageLike = {
			...normalizedRecord,
			...(normalizedType ? { type: normalizedType } : {}),
			...(normalizedType === 'tool'
				? {
					tool_call_id:
						typeof messageRecord.tool_call_id === 'string'
							? messageRecord.tool_call_id
							: typeof record.tool_call_id === 'string'
								? record.tool_call_id
								: 'tool',
				}
				: {}),
		} as BaseMessageLike;

		return coerceMessageLikeToMessage(messageLike);
	} catch {
		return new HumanMessage(JSON.stringify(input));
	}
}

export function rehydrateThreadMessages(messages: unknown[]): BaseMessage[] {
	return messages.map((message) => coerceStoredMessage(message));
}

export function resolveThreadValues(thread: AgentThread | undefined) {
	if (!thread) {
		return { messages: [] as BaseMessage[] };
	}

	const persistedMessages =
		thread.state && Array.isArray(thread.state.messages) ? thread.state.messages : [];

	const hydratedMessages = Array.isArray(persistedMessages)
		? rehydrateThreadMessages(persistedMessages)
		: [];

	return {
		...(thread.state ?? {}),
		messages: hydratedMessages,
	};
}

export function resolveThreadStateSnapshot(thread: AgentThread | undefined) {
	if (!thread) {
		return null;
	}

	return {
		values: resolveThreadValues(thread),
		checkpoint: thread.checkpoint_id
			? {
				checkpoint_id: thread.checkpoint_id,
			}
			: null,
	};
}

export function resolvePromptFromInput(input: unknown): string {
	if (!input || typeof input !== 'object') {
		return '';
	}

	const record = input as Record<string, unknown>;
	const messages = Array.isArray(record.messages) ? record.messages : [];
	const lastMessage = messages.at(-1);

	if (!lastMessage || typeof lastMessage !== 'object') {
		return '';
	}

	const content = (lastMessage as Record<string, unknown>).content;
	if (typeof content === 'string') {
		return content;
	}

	if (Array.isArray(content)) {
		return content
			.map((item) => {
				if (typeof item === 'string') {
					return item;
				}

				if (!item || typeof item !== 'object') {
					return '';
				}

				const block = item as Record<string, unknown>;
				return typeof block.text === 'string' ? block.text : '';
			})
			.join('')
			.trim();
	}

	return '';
}