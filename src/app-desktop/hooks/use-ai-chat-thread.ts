import { useEffect, useMemo, useState } from 'react';
import { useStream } from '@langchain/react';
import { HumanMessage } from '@langchain/core/messages';

import { AIEngine } from '#/app-desktop/engines/ai-engine';
import { useAceMemory } from '#/app-desktop/hooks/use-ace-memory';
import type { AgentConfigurable, AgentThread, AIProviderType } from '#/shared/schemas/ai';
import {
	createStreamOptions,
	resolveActiveThreadUid,
	waitForThreadRun,
} from '#/app-desktop/hooks/use-ai-chat-thread.stream';
import {
	resolvePromptFromInput,
	resolveThreadValues,
} from '#/app-desktop/hooks/use-ai-chat-thread.utils';

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
	const [pending_prompt, setPendingPrompt] = useState<string | null>(null);
	const [is_submitting_prompt, setIsSubmittingPrompt] = useState(false);

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

	// Flow:
	// 1. Hydrate from kernel memory so the latest saved transcript shows up immediately.
	// 2. Feed useStream from an Electron-backed event queue so assistant text can grow token-by-token.
	// 3. Resync the persisted thread snapshot after each run so the final state remains durable.
	const streamOptions = useMemo(
		() =>
			createStreamOptions(current_thread_uid, current_thread, (threadId: string) => {
				setCurrentThreadUidState(threadId);
				AIEngine.setCurrentThread(threadId);
			}),
		[current_thread, current_thread_uid],
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

		setPendingPrompt(normalizedPrompt);
		setIsSubmittingPrompt(true);

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

			await AIEngine.syncThread(threadUid, {
				provider: selectedProvider,
				model: selectedModel,
				updated_at: Date.now(),
			});

			await stream.submit({
				messages: [
					{
						type: 'human' as const,
						content: normalizedPrompt,
					},
				],
			});
			await waitForThreadRun(resolveActiveThreadUid(threadUid) ?? threadUid);

			const thread = await AIEngine.syncCurrentThreadFromBackground(threadUid);
			setCurrentThreadUidState(threadUid);
			setCurrentThreadState(thread ?? null);
			return thread;
		} finally {
			setPendingPrompt(null);
			setIsSubmittingPrompt(false);
		}
	};

	const interruptThread = async () => {
		await stream.stop();
	};

	const messages = useMemo(() => {
		const baseMessages =
			persisted_messages.length > stream.messages.length ? persisted_messages : stream.messages;

		if (!pending_prompt) {
			return baseMessages;
		}

		const lastMessage = baseMessages.at(-1);
		if (
			lastMessage &&
			HumanMessage.isInstance(lastMessage) &&
			(lastMessage.text || resolvePromptFromInput({ messages: [lastMessage] })) === pending_prompt
		) {
			return baseMessages;
		}

		return [...baseMessages, new HumanMessage(pending_prompt)];
	}, [pending_prompt, persisted_messages, stream.messages]);
	const is_streaming = stream.isLoading || is_submitting_prompt;

	return {
		list_threads,
		current_thread_uid,
		current_thread,
		messages,
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
