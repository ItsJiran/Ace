import { useEffect, useMemo, useState } from 'react';
import { useStream } from '@langchain/react';

import { AIEngine } from '#/app-desktop/engines/ai-engine';
import { EventBus } from '#/shared/engines/event-engine';
import { useAceMemory } from '#/app-desktop/hooks/use-ace-memory';
import {
	AI_THREAD_STREAM_EVENT_SLUG,
	type AgentConfigurableType,
	type AgentThread,
	type AIProviderType,
	type BackgroundAIStreamEventPayloadType,
} from '#/shared/schemas/ai';
import {
	createStreamOptions,
	resolveActiveThreadUid,
	submitPromptToThread,
} from '#/app-desktop/hooks/use-ai-chat-thread.stream';
import {
	resolveThreadValues,
} from '#/app-desktop/hooks/use-ai-chat-thread.utils';

export type RunningToolStreamItem = {
	uid: string;
	toolName: string;
	input: unknown;
	startedAt: number;
};

export type AIThreadStatus = {
	label: 'idle' | 'orchestrating' | 'delegating' | 'executing';
	detail: string;
};

export function useAIChatThread(options?: { scopeKey?: string | null }) {
	const scopeKey = options?.scopeKey ?? null;
	const list_threads = useAceMemory<Record<string, string>>(AIEngine.thread_uids_memory_uid) ?? {};
	const active_thread_uid =
		useAceMemory<string | null>(AIEngine.current_thread_uid_memory_uid_for_scope(scopeKey)) ?? null;
	const current_thread_memory_uid = active_thread_uid
		? AIEngine.thread_memory_uid(active_thread_uid)
		: '__ace_background_thread_empty__';
	const current_thread_from_memory = useAceMemory<AgentThread>(current_thread_memory_uid);
	const [current_thread_uid, setCurrentThreadUidState] = useState<string | null>(active_thread_uid);
	const [current_thread, setCurrentThreadState] = useState<AgentThread | null>(
		current_thread_from_memory ?? null,
	);
	const pending_prompt = null;
	const [is_submitting_prompt, setIsSubmittingPrompt] = useState(false);
	const [is_waiting_for_backend_run, setIsWaitingForBackendRun] = useState(false);
	const [running_tool_streams, setRunningToolStreams] = useState<RunningToolStreamItem[]>([]);

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
			setIsWaitingForBackendRun(false);
			setRunningToolStreams([]);
			return;
		}

		void AIEngine.syncCurrentThreadFromBackground(current_thread_uid).then((thread) => {
			setCurrentThreadState(thread ?? null);
		});
	}, [current_thread_uid]);

	useEffect(() => {
		return EventBus.listen<BackgroundAIStreamEventPayloadType>(AI_THREAD_STREAM_EVENT_SLUG, (event) => {
			const payload = event?.payload;
			if (!payload) {
				return;
			}

			const observedThreadUid = resolveActiveThreadUid(current_thread_uid);
			console.log('[useAIChatThread stream-event]', {
				payload_thread_uid: payload.thread_uid,
				observed_thread_uid: observedThreadUid,
				message: payload.message,
			});
			if (!observedThreadUid || payload.thread_uid !== observedThreadUid) {
				console.log('[useAIChatThread stream-event ignored]', {
					reason: 'thread-mismatch',
					payload_thread_uid: payload.thread_uid,
					observed_thread_uid: observedThreadUid,
					message: payload.message,
				});
				return;
			}

			const message = payload.message as unknown as Record<string, unknown>;
			if (message.method === 'lifecycle') {
				const lifecycleData =
					message.params && typeof message.params === 'object'
						? ((message.params as Record<string, unknown>).data as Record<string, unknown> | undefined)
						: undefined;

				if (lifecycleData?.event === 'started') {
					setIsWaitingForBackendRun(true);
					return;
				}

				if (lifecycleData?.event === 'completed' || lifecycleData?.event === 'failed') {
					setIsWaitingForBackendRun(false);
					setRunningToolStreams([]);
					void AIEngine.syncCurrentThreadFromBackground(payload.thread_uid).then((thread) => {
						if (resolveActiveThreadUid(current_thread_uid) !== payload.thread_uid) {
							return;
						}

						setCurrentThreadState(thread ?? null);
					});
				}
				return;
			}

			if (message.method !== 'tool') {
				return;
			}

			const params =
				message.params && typeof message.params === 'object'
					? (message.params as Record<string, unknown>)
					: null;
			const data =
				params?.data && typeof params.data === 'object'
					? (params.data as Record<string, unknown>)
					: null;

			if (!data || typeof data.event !== 'string' || typeof data.tool_name !== 'string') {
				console.log('[useAIChatThread tool-event ignored]', {
					reason: 'missing-tool-data',
					message,
					params,
					data,
				});
				return;
			}

			if (data.event === 'tool-start') {
				const nextItem: RunningToolStreamItem = {
					uid:
						typeof data.tool_event_stream_uid === 'string' && data.tool_event_stream_uid
							? data.tool_event_stream_uid
							: String(message.event_id ?? `${data.tool_name}:${Date.now()}`),
					toolName: data.tool_name,
					input: data.input ?? null,
					startedAt: typeof params?.timestamp === 'number' ? params.timestamp : Date.now(),
				};

				console.log('[useAIChatThread tool-start accepted]', nextItem);
				setRunningToolStreams((currentItems) => {
					const nextItems = [...currentItems, nextItem];
					console.log('[useAIChatThread running tools next]', nextItems);
					return nextItems;
				});
				return;
			}

			if (data.event === 'tool-finish' || data.event === 'tool-error') {
				setRunningToolStreams((currentItems) => {
					const matchedIndex = currentItems.findIndex((item) => item.toolName === data.tool_name);
					if (matchedIndex === -1) {
						return currentItems;
					}

					const nextItems = currentItems.filter((_, index) => index !== matchedIndex);
					console.log('[useAIChatThread tool-finish removed]', {
						event: data.event,
						tool_name: data.tool_name,
						nextItems,
					});
					return nextItems;
				});
			}
		});
	}, [current_thread_uid]);

	useEffect(() => {
		console.log('[useAIChatThread running_tool_streams]', running_tool_streams);
	}, [running_tool_streams]);

	// Flow:
	// 1. Hydrate from kernel memory so the latest saved transcript shows up immediately.
	// 2. Feed useStream from an Electron-backed event queue so assistant text can grow token-by-token.
	// 3. Resync the persisted thread snapshot after each run so the final state remains durable.
	const streamOptions = useMemo(
		() =>
			createStreamOptions(current_thread_uid, current_thread, (threadId: string) => {
				setCurrentThreadUidState(threadId);
				AIEngine.setCurrentThread(threadId, scopeKey);
			}),
		[current_thread, current_thread_uid, scopeKey],
	);

	const stream = useStream<Record<string, unknown>>(streamOptions);
	const persisted_messages = useMemo(() => {
		const values = resolveThreadValues(current_thread ?? undefined);
		return values.messages;
	}, [current_thread]);

	const refreshThreads = async () => {
		return await AIEngine.listThreads();
	};

	const setCurrentThread = async (threadUid: string | null) => {
		setCurrentThreadUidState(threadUid);
		AIEngine.setCurrentThread(threadUid, scopeKey);
		if (!threadUid) {
			setCurrentThreadState(null);
			return null;
		}

		const thread = await AIEngine.syncCurrentThreadFromBackground(threadUid);
		setCurrentThreadState(thread ?? null);
		return thread;
	};

	const createThread = async (overrides: Partial<AgentConfigurableType> = {}) => {
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

		setIsSubmittingPrompt(true);
		setIsWaitingForBackendRun(true);

		try {
			let threadUid = current_thread_uid;
			if (!threadUid) {
				const created = await createThread({
					provider: selectedProvider,
					model: selectedModel,
				});
				threadUid = created.thread_id;
			}

			if (!threadUid) {
				return null;
			}

			const nextPersistedMessages = [
				...(Array.isArray(current_thread?.messages) ? current_thread.messages : []),
				{
					type: 'human',
					content: normalizedPrompt,
				},
			];

			await AIEngine.syncThread(threadUid, {
				provider: selectedProvider,
				model: selectedModel,
				messages: nextPersistedMessages,
				state: current_thread?.state,
				updated_at: Date.now(),
			});
			setCurrentThreadUidState(threadUid);
			setCurrentThreadState(AIEngine.readThreadFromMemory(threadUid) ?? null);

			submitPromptToThread(threadUid, normalizedPrompt);

			return AIEngine.readThreadFromMemory(resolveActiveThreadUid(threadUid) ?? threadUid) ?? null;
		} finally {
			setIsSubmittingPrompt(false);
		}
	};

	const interruptThread = async () => {
		const activeThreadUid = resolveActiveThreadUid(current_thread_uid);
		if (activeThreadUid) {
			await AIEngine.stopThreadPrompt(activeThreadUid);
			const syncedThread = await AIEngine.syncCurrentThreadFromBackground(activeThreadUid);
			setCurrentThreadState(syncedThread ?? null);
		}
	};

	const messages = useMemo(() => {
		const baseMessages =
			persisted_messages.length > stream.messages.length ? persisted_messages : stream.messages;
		return baseMessages;
	}, [persisted_messages, stream.messages]);
	const is_streaming = is_waiting_for_backend_run || is_submitting_prompt;
	const ai_status = useMemo<AIThreadStatus>(() => {
		const runningToolNames = running_tool_streams.map((item) => item.toolName);

		if (runningToolNames.includes('planning_execution_batch')) {
			return {
				label: 'delegating',
				detail: 'planning execution batch',
			};
		}

		if (runningToolNames.includes('update_execution_batch')) {
			return {
				label: 'executing',
				detail: 'updating execution batch',
			};
		}

		if (runningToolNames.length > 0) {
			return {
				label: 'executing',
				detail: `running ${runningToolNames[0]}`,
			};
		}

		if (is_streaming) {
			return {
				label: 'orchestrating',
				detail: 'planning next step',
			};
		}

		return {
			label: 'idle',
			detail: current_thread_uid ? 'ready on selected thread' : 'ready with no thread selected',
		};
	}, [current_thread_uid, is_streaming, running_tool_streams]);

	return {
		list_threads,
		current_thread_uid,
		current_thread,
		messages,
		running_tool_streams,
		ai_status,
		pending_prompt,
		is_streaming,
		stream,
		refreshThreads,
		setCurrentThread,
		createThread,
		sendPrompt,
		interruptThread,
	};
}
