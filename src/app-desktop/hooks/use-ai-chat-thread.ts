import { useEffect, useMemo, useState } from 'react';
import { useStream } from '@langchain/react';
import type { CustomAdapterOptions } from '@langchain/react';
import type { AgentServerAdapter } from '@langchain/langgraph-sdk';
import { coerceMessageLikeToMessage } from '@langchain/core/messages';
import type { BaseMessageLike } from '@langchain/core/messages';

import { AIEngine } from '#/app-desktop/engines/ai-engine';
import { useAceMemory } from '#/app-desktop/hooks/use-ace-memory';
import type { AgentConfigurable, AgentThread, AIProviderType } from '#/shared/schemas/ai';

function resolveStoredMessageType(input: Record<string, unknown>): string | null {
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

function coerceStoredMessage(input: unknown) {
	if (!input || typeof input !== 'object') {
		return input;
	}

	if (typeof (input as { getType?: () => string }).getType === 'function') {
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
		return input;
	}
}

function rehydrateThreadMessages(messages: unknown[]) {
	return messages.map((message) => coerceStoredMessage(message));
}

function resolveActiveThreadUid(threadUid: string | null, currentThread: AgentThread | undefined) {
	return (
		AIEngine.readCurrentThreadUidFromMemory() ?? threadUid ?? currentThread?.thread_uid ?? null
	);
}

function resolveThreadValues(thread: AgentThread | undefined) {
	if (!thread) {
		return { messages: [] as unknown[] };
	}

	const hydratedMessages = Array.isArray(thread.messages)
		? rehydrateThreadMessages(thread.messages)
		: [];

	return {
		...(thread.state ?? {}),
		messages: hydratedMessages,
	};
}

function resolvePromptFromInput(input: unknown): string {
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

function createThreadTransport(threadUid: string | null, currentThread: AgentThread | undefined) {
	return {
		threadId: threadUid ?? '__ace_background_thread__',
		async open() {},
		async send(command: { id?: number; method?: string; params?: Record<string, unknown> }) {
			const activeThreadUid = resolveActiveThreadUid(threadUid, currentThread);

			if (command.method === 'run.start' && activeThreadUid) {
				const prompt = resolvePromptFromInput(command.params?.input);
				if (prompt) {
					await AIEngine.streamThreadPrompt(activeThreadUid, prompt);
				} else {
					await AIEngine.syncCurrentThreadFromBackground(activeThreadUid);
				}
			}

			return {
				type: 'success' as const,
				id: command.id ?? 0,
				result: {
					run_id: crypto.randomUUID(),
				},
			};
		},
		async *events() {
			void threadUid;
		},
		async close() {},
		async getState() {
			const activeThreadUid = resolveActiveThreadUid(threadUid, currentThread);
			if (!activeThreadUid) {
				return null;
			}

			const thread = await AIEngine.syncCurrentThreadFromBackground(activeThreadUid);
			const resolvedThread = thread ?? currentThread;
			if (!resolvedThread) {
				return null;
			}

			return {
				values: resolveThreadValues(resolvedThread),
				checkpoint: resolvedThread.checkpoint_id
					? {
						  checkpoint_id: resolvedThread.checkpoint_id,
					  }
					: null,
			};
		},
	} as AgentServerAdapter;
}

export function useAIChatThread() {
	const list_threads = useAceMemory<Record<string, string>>(AIEngine.thread_uids_memory_uid) ?? {};
	const active_thread_uid =
		useAceMemory<string | null>(AIEngine.current_thread_uid_memory_uid) ?? null;
	const current_thread_memory_uid = active_thread_uid
		? AIEngine.thread_memory_uid(active_thread_uid)
		: '__ace_background_thread_empty__';
	const current_thread_from_memory = useAceMemory<AgentThread>(current_thread_memory_uid);
	const [current_thread_uid, setCurrentThreadUidState] = useState<string | null>(active_thread_uid);
	const [current_thread, setCurrentThreadState] = useState<AgentThread | null>(
		current_thread_from_memory ?? null,
	);

	useEffect(() => {
		void AIEngine.syncAIMemory();
	}, []);

	useEffect(() => {
		setCurrentThreadUidState(active_thread_uid);
	}, [active_thread_uid]);

	useEffect(() => {
		setCurrentThreadState(current_thread_from_memory ?? null);
	}, [current_thread_from_memory]);

	useEffect(() => {
		if (!current_thread_uid) {
			setCurrentThreadState(null);
			return;
		}

		void AIEngine.syncCurrentThreadFromBackground(current_thread_uid).then((thread) => {
			setCurrentThreadState(thread ?? null);
		});
	}, [current_thread_uid]);

	const streamTransport = useMemo(
		() => createThreadTransport(current_thread_uid, current_thread ?? undefined),
		[current_thread, current_thread_uid],
	);

	const streamOptions: CustomAdapterOptions<Record<string, unknown>> = {
		threadId: current_thread_uid,
		transport: streamTransport,
		initialValues: resolveThreadValues(current_thread ?? undefined),
		onThreadId: (threadId: string) => {
			setCurrentThreadUidState(threadId);
			AIEngine.setCurrentThread(threadId);
		},
	};

	const stream = useStream<Record<string, unknown>>(streamOptions);

	const refreshThreads = async () => {
		return await AIEngine.listThreads();
	};

	const setCurrentThread = async (threadUid: string | null) => {
		setCurrentThreadUidState(threadUid);
		AIEngine.setCurrentThread(threadUid);
		if (!threadUid) {
			setCurrentThreadState(null);
			return null;
		}

		const thread = await AIEngine.syncCurrentThreadFromBackground(threadUid);
		setCurrentThreadState(thread ?? null);
		return thread;
	};

	const createThread = async (overrides: Partial<AgentConfigurable> = {}) => {
		const created = await AIEngine.createThread({
			thread_uid: overrides.thread_id,
			checkpoint_id: overrides.checkpoint_id,
			model: overrides.model,
			provider: overrides.provider,
		});

		await setCurrentThread(created.thread_id);
		return created;
	};

	const sendPrompt = async (
		prompt: string,
		selectedProvider: AIProviderType,
		selectedModel: string,
	) => {
		const normalizedPrompt = prompt.trim();
		if (!normalizedPrompt) {
			return null;
		}

		let threadUid = current_thread_uid;
		let createdNewThread = false;
		if (!threadUid) {
			const created = await createThread({
				provider: selectedProvider,
				model: selectedModel,
			});
			threadUid = created.thread_id;
			createdNewThread = true;
		}

		if (!threadUid) {
			return null;
		}

		const shouldUseDirectEngineSend = createdNewThread || stream.threadId !== threadUid;

		if (shouldUseDirectEngineSend) {
			const thread = await AIEngine.streamThreadPrompt(threadUid, normalizedPrompt, {
				provider: selectedProvider,
				model: selectedModel,
			});
			setCurrentThreadUidState(threadUid);
			setCurrentThreadState(thread ?? null);
			return thread;
		}

		await stream.submit({
			messages: [
				{
					type: 'human' as const,
					content: normalizedPrompt,
				},
			],
		});

		const thread = await AIEngine.syncCurrentThreadFromBackground(threadUid);
		setCurrentThreadUidState(threadUid);
		setCurrentThreadState(thread ?? null);
		return thread;
	};

	const interruptThread = async () => {
		await stream.stop();
	};

	const messages = stream.messages;

	return {
		list_threads,
		current_thread_uid,
		current_thread,
		messages,
		stream,
		refreshThreads,
		setCurrentThread,
		createThread,
		sendPrompt,
		interruptThread,
	};
}
