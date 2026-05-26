import { useEffect, useMemo, useState } from 'react';
import { useStream } from '@langchain/react';

import { AgentClientEngine } from '#/app-desktop/engines/agent-client-engine';
import { useAceMemory } from '#/app-desktop/hooks/use-ace-memory';
import {
    type AgentConfigurableType,
    type AgentThread,
    type AIProviderType,
} from '#/shared/schemas/ai';
import {
    createStreamOptions,
    resolveActiveThreadUid,
    submitPromptToThread,
} from '#/app-desktop/hooks/use-ai-chat-thread.stream';
import { resolveThreadValues } from '#/app-desktop/hooks/use-ai-chat-thread.utils';
import { useAIChatThreadEvents } from '#/app-desktop/hooks/use-ai-chat-thread.events';

export type RunningToolStreamItem = {
    uid: string;
    toolName: string;
    input: unknown;
    startedAt: number;
};

export type RunningStepStreamItem = {
    uid: string;
    node: string;
    title: string;
    startedAt: number;
};

export type WorkflowEventFeedItem = {
    uid: string;
    kind: 'step';
    node: string;
    title: string;
    event: 'start' | 'finish';
    createdAt: number;
};

export type AIThreadStatus = {
    label: 'idle' | 'orchestrating' | 'delegating' | 'executing';
    detail: string;
};

export function useAIChatThread() {

	const list_threads =
        useAceMemory<Record<string, string>>(AgentClientEngine.thread_uids_memory_uid) ?? {};

    const [current_thread_uid, setCurrentThreadUidState] = useState<string | null>(null);

    const current_thread_memory_uid = current_thread_uid
        ? AgentClientEngine.thread_memory_uid(current_thread_uid)
        : '__ace_background_thread_empty__';

    const current_thread_from_memory = useAceMemory<AgentThread>(current_thread_memory_uid);

    const [current_thread, setCurrentThreadState] = useState<AgentThread | null>(
        current_thread_from_memory ?? null,
    );

	const pending_prompt = null;
    const [is_submitting_prompt, setIsSubmittingPrompt] = useState(false);
    const {
        is_waiting_for_backend_run,
        markRunRequested,
        clearStreamState,
    } = useAIChatThreadEvents({
        threadUid: current_thread_uid,
        onThreadSynced: (thread) => {
            setCurrentThreadState(thread ?? null);
        },
    });

    /**
     * + ------------------ LIFECYCLE - HOOKS -------------------------------------------------------------------------------- +
     */

    useEffect(() => {
        void AgentClientEngine.syncAIMemory();
    }, []);

    useEffect(() => {
        const threadUids = Object.keys(list_threads);
        if (current_thread_uid && threadUids.includes(current_thread_uid)) {
            return;
        }

        setCurrentThreadUidState(threadUids[0] ?? null);
    }, [current_thread_uid, list_threads]);

    useEffect(() => {
        setCurrentThreadState(current_thread_from_memory ?? null);
    }, [current_thread_from_memory]);

    useEffect(() => {
        if (!current_thread_uid) {
            setCurrentThreadState(null);
            clearStreamState();
            return;
        }

        void AgentClientEngine.syncCurrentThreadFromBackground(current_thread_uid).then((thread) => {
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
            }),
        [current_thread, current_thread_uid],
    );

    const stream = useStream<Record<string, unknown>>(streamOptions);

    const persisted_messages = useMemo(() => {
        const values = resolveThreadValues(current_thread ?? undefined);
        return values.messages;
    }, [current_thread]);

    // + ---------------------------------- THREADS API -------------------------------------------------------------------------------- +

    const refreshThreads = async () => {
        return await AgentClientEngine.listThreads();
    };

    const setCurrentThread = async (threadUid: string | null) => {
        setCurrentThreadUidState(threadUid);
        if (!threadUid) {
            setCurrentThreadState(null);
            return null;
        }

        const thread = await AgentClientEngine.syncCurrentThreadFromBackground(threadUid);
        setCurrentThreadState(thread ?? null);
        return thread;
    };

    const createThread = async (overrides: Partial<AgentConfigurableType> = {}) => {
        const created = await AgentClientEngine.createThread({
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
        markRunRequested();

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

            await AgentClientEngine.syncThread(threadUid, {
                provider: selectedProvider,
                model: selectedModel,
                messages: nextPersistedMessages,
                state: current_thread?.state,
                updated_at: Date.now(),
            });
            setCurrentThreadUidState(threadUid);
            setCurrentThreadState(AgentClientEngine.readThreadFromMemory(threadUid) ?? null);

            submitPromptToThread(threadUid, normalizedPrompt);

            return (
                AgentClientEngine.readThreadFromMemory(resolveActiveThreadUid(threadUid) ?? threadUid) ??
                null
            );
        } finally {
            setIsSubmittingPrompt(false);
        }
    };

    const interruptThread = async () => {
        const activeThreadUid = resolveActiveThreadUid(current_thread_uid);
        if (activeThreadUid) {
            await AgentClientEngine.stopThreadPrompt(activeThreadUid);
            const syncedThread = await AgentClientEngine.syncCurrentThreadFromBackground(activeThreadUid);
            setCurrentThreadState(syncedThread ?? null);
        }
    };

    const messages = useMemo(() => {
        const baseMessages =
            persisted_messages.length > stream.messages.length
                ? persisted_messages
                : stream.messages;
        return baseMessages;
    }, [persisted_messages, stream.messages]);

    const is_streaming = is_waiting_for_backend_run || is_submitting_prompt;

    const ai_status = useMemo<AIThreadStatus>(() => {
        if (is_streaming) {
            return {
                label: 'orchestrating',
				detail: 'waiting for agent output',
            };
        }

        return {
            label: 'idle',
            detail: current_thread_uid
                ? 'ready on selected thread'
                : 'ready with no thread selected',
        };
        	}, [current_thread_uid, is_streaming]);

    return {
        list_threads,
        current_thread_uid,
        current_thread,
        messages,
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
