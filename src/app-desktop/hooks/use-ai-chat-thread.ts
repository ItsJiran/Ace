import { useEffect, useMemo, useState } from 'react';
import { useStream } from '@langchain/react';

import { AgentClientEngine } from '#/app-desktop/engines/agent-client-engine';
import { useAceMemory } from '#/app-desktop/hooks/use-ace-memory';
import { AgentThread, type AgentConfigurableType, type AIProviderType } from '#/shared/schemas/ai';

import {
    AgentClientThreadEphemeralItem,
    type AgentClientThreadRuntimeState,
} from '#/shared/schemas/agent-client-ephemeral';

import { resolveActiveThreadUid } from '#/app-desktop/hooks/use-ai-chat-thread.stream';
import { AgentChatTurn } from '#/shared/schemas/agent-thread-state';

export type AIThreadStatus = {
    label: 'idle' | 'orchestrating' | 'delegating' | 'executing';
    detail: string;
};

export function useAIChatThread() {
    const list_threads =
        useAceMemory<Record<string, string>>(AgentClientEngine.thread_uids_memory_uid) ?? {};

    const [current_thread_uid, setCurrentThreadUid] = useState<string | null>(null);

    const current_thread: AgentThread | undefined = useAceMemory<AgentThread>(
        AgentClientEngine.thread_memory_uid(current_thread_uid ?? ''),
    );

    const current_thread_runtime = useAceMemory<AgentClientThreadRuntimeState>(
        AgentClientEngine.thread_runtime_memory_uid(current_thread_uid ?? ''),
    );

    const current_thread_ephemeral_messages =
        useAceMemory<AgentClientThreadEphemeralItem[]>(
            AgentClientEngine.thread_ephemeral_memory_uid(current_thread_uid ?? ''),
        ) ?? [];

    /**
     * Local UI State
     */

    const is_streaming = current_thread_runtime?.is_streaming ?? false;

    const messages: AgentChatTurn[] = current_thread?.state?.messages ?? [];

    // + ---------------------- LOCAL UI STATE ----------------------------- +

    // const [is_submitting_prompt, setIsSubmittingPrompt] = useState(false);
    // const [last_submitted_prompt, setLastSubmittedPrompt] = useState<string | null>(null);

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

        setCurrentThreadUid(threadUids[0] ?? null);
    }, [current_thread_uid, list_threads]);

    // Flow:
    // 1. Hydrate from kernel memory so the latest saved transcript shows up immediately.
    // 2. Feed useStream from an Electron-backed event queue so assistant text can grow token-by-token.
    // 3. Resync the persisted thread snapshot after each run so the final state remains durable.
    // const streamOptions = useMemo(
    //     () =>
    //         createStreamOptions(current_thread_uid, current_thread, (threadId: string) => {
    //             setCurrentThreadUidState(threadId);
    //         }),
    //     [current_thread, current_thread_uid],
    // );

    // const stream = useStream<Record<string, unknown>>(streamOptions);

    // const persisted_messages = useMemo(() => {
    //     const values = resolveThreadValues(current_thread ?? undefined);
    //     return values.messages;
    // }, [current_thread]);

    // + ---------------------------------- THREADS API -------------------------------------------------------------------------------- +

    const refreshThreads = async () => {
        return await AgentClientEngine.listThreads();
    };

    const createThread = async (overrides: Partial<AgentConfigurableType> = {}) => {
        const created = await AgentClientEngine.createThread({
            thread_uid: overrides.thread_id,
            checkpoint_id: overrides.checkpoint_id,
            model: overrides.model,
            provider: overrides.provider,
        });

        await setCurrentThreadUid(created.thread_id);
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

            await AgentClientEngine.syncThread(threadUid, {
                provider: selectedProvider,
                model: selectedModel,
                state: {
                    ...(current_thread?.state ?? {}),
                },
                updated_at: Date.now(),
            });

            await setCurrentThreadUid(threadUid);
            AgentClientEngine.startThreadPrompt(threadUid, normalizedPrompt);

            return (
                AgentClientEngine.readThreadFromMemory(
                    resolveActiveThreadUid(threadUid) ?? threadUid,
                ) ?? null
            );
        } finally {
        }
    };

    const interruptThread = async () => {
        if (current_thread_uid) {
            await AgentClientEngine.stopThreadPrompt(current_thread_uid);
        }
    };

    return {
        list_threads,
        current_thread_uid,

        current_thread,
        current_thread_runtime,

        is_streaming,
        messages,
        ephemeral_messages: current_thread_ephemeral_messages,

        refreshThreads,
        setCurrentThreadUid,
        createThread,
        sendPrompt,
        interruptThread,
    };
}
