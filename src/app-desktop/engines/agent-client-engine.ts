import { Engine } from '#/shared/engines/engine';
import { ConfigEngine } from '#/shared/engines/config-engine';
import { DefaultConfigAI } from '#/shared/constants/config';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import { RPCEngine } from '#/shared/engines/rpc-engine';
import {
    AgentThread,
    AgentConfigurableType,
    AIProviderType,
    BackgroundAIStreamEventPayloadType,
} from '#/shared/schemas/ai';

import { AgentClientThreadRuntimeState } from '#/shared/schemas/agent-client-ephemeral';
import type { AgentChatTurn } from '#/shared/schemas/agent-thread-state';

import { EventBus } from '#/shared/engines/event-engine';
import { AI_THREAD_STREAM_EVENT_SLUG, AI_GRAPH_OBSERVE_SLUG } from '#/shared/schemas/ai';
import AgentThreadStreamHandlers from './agent/agent-thread-stream-handlers';
import resolveAgentInvokeContext from './ai/resolve-agent-context';
import normalizeMessages from './ai/utils/normalize-messages';
import { AceWorkflowState } from '#/app-background/engines/ai/workflows';

// AgentClientEngine is the desktop-side control plane for AI threads.
//
// Architecture (post-refactor):
// - AgentThread lives purely on the client (KernelEngine memory).
// - Background only runs the LangGraph workflow and streams events.
// - Raw AceWorkflowState (BaseMessage[]) is fetched from LangGraph
//   checkpointer when needed and formatted into AgentChatTurn[] locally.
// - Thread CRUD (create, read, list, delete) is entirely local.
//
// Agentic flow:
// - UI sends prompt -> startThreadPrompt() -> background RPC
// - background emits stream events -> RPC route -> AgentThreadStreamHandlers
// - handlers convert deltas to settled messages and write to local Kernel memory
// - React hooks read memory; they do not own stream side-effects.
class AgentClientEngineSingleton extends Engine {
    public readonly memory_uid = DefaultConfigAI.memory_uid;
    public readonly thread_uids_memory_uid = 'system:ai_engine:thread:uids';

    public readonly thread_memory_uid = (thread_uid: string) =>
        `system:ai_engine:thread:${thread_uid}`;
    public readonly thread_runtime_memory_uid = (thread_uid: string) =>
        `system:ai_engine:thread-runtime:${thread_uid}`;
    public readonly thread_ephemeral_memory_uid = (thread_uid: string) =>
        `system:ai_engine:thread-ephemeral:${thread_uid}`;

    // + --------------- ABSTRACT METHODS ----------------- +

    async boot() {
        // No bulk sync needed — threads live locally. Just warm config.
        await this.syncConfigFromBackground();
    }

    async setupEventRoutes() {}

    async setupKernelSpace() {
        KernelEngine.registerSystemMemory(
            this.thread_uids_memory_uid,
            {} as Record<string, string>,
        );
    }

    async setupKernelTerminationHook() {}

    async setupRpcRoutes() {
        RPCEngine.handle(
            AI_THREAD_STREAM_EVENT_SLUG,
            async ({ payload }: { payload: BackgroundAIStreamEventPayloadType }) => {
                await AgentThreadStreamHandlers.handlePayload(payload);
            },
        );

        // Forward graph observe events from middleware to EventBus
        // so AgentGraphDebug window can listen via `ai-graph-debug:{thread_uid}`
        RPCEngine.handle(
            AI_GRAPH_OBSERVE_SLUG,
            async ({ payload }: { payload: { thread_uid: string; event: Record<string, unknown> } }) => {
                console.log('[AgentClientEngine] Received graph observe event:', payload);
                EventBus.emit(`ai-graph-debug:${payload.thread_uid}`, { payload: payload.event });
            },
        );
    }

    // + --------------- MODEL API ----------------------- +

    async fetchModels(provider: AIProviderType | string) {
        const models = ((await RPCEngine.invoke('ai.syncAvailableModels', {
            provider: String(provider),
        })) ?? []) as string[];
        await this.syncConfigFromBackground();
        return models;
    }

    // + --------------- THREAD CRUD (Local) ------------- +

    syncThreadIndex(index: Record<string, string>) {
        KernelEngine.writeMemory(this.thread_uids_memory_uid, index);
        return index;
    }

    async listThreads() {
        // Pull known thread IDs + raw states from background checkpointer.
        const bgPayload = (await RPCEngine.invoke('ai.listThreads', {})) as {
            threads: Array<{ thread_uid: string; state: AceWorkflowState | null }>;
        } | null;

        const bgThreads = bgPayload?.threads ?? [];

        // Hydrate local AgentThread entries from raw workflow states.
        for (const { thread_uid, state: rawState } of bgThreads) {
            if (!rawState || !Array.isArray(rawState.messages)) continue;

            const messages: AgentChatTurn[] = normalizeMessages(rawState.messages);
            const existing = this.readThreadFromMemory(thread_uid);

            const thread: AgentThread = {
                thread_uid,
                checkpoint_id: existing?.checkpoint_id,
                model: existing?.model,
                provider: existing?.provider,
                state: {
                    messages,
                },
                created_at: existing?.created_at ?? Date.now(),
                updated_at: Date.now(),
            };

            this.syncThreadMemory(thread);
        }

        // Return local threads (now hydrated).
        const index = this.readThreadIndexFromMemory();
        return Object.entries(index)
            .map(([thread_uid]) => this.readThreadFromMemory(thread_uid))
            .filter((t): t is AgentThread => t !== undefined);
    }

    async createThread(initialState: Partial<AgentThread> = {}): Promise<AgentConfigurableType> {
        const thread_uid = initialState.thread_uid ?? crypto.randomUUID();
        const now = Date.now();

        const thread: AgentThread = {
            thread_uid,
            checkpoint_id: initialState.checkpoint_id,
            model:
                initialState.model ??
                (ConfigEngine.getConfigItem<string>('ai', 'ai.default_model') as string),
            provider:
                initialState.provider ??
                (ConfigEngine.getConfigItem<AIProviderType>(
                    'ai',
                    'ai.default_provider',
                ) as AIProviderType),
            state: {
                messages: [],
                ...(initialState.state ?? {}),
            },
            created_at: initialState.created_at ?? now,
            updated_at: initialState.updated_at ?? now,
        };

        this.syncThreadMemory(thread);

        // Initialize runtime state so the stop button can sync immediately.
        KernelEngine.writeMemory(this.thread_runtime_memory_uid(thread_uid), {
            is_streaming: false,
        } as AgentClientThreadRuntimeState);

        // Register in background so listThreads can find it.
        RPCEngine.invoke('ai.syncThread', { thread_uid }).catch(() => {});

        return {
            thread_id: thread_uid,
            checkpoint_id: thread.checkpoint_id,
            model: thread.model,
            provider: thread.provider,
        };
    }

    async readThread(threadUid: string): Promise<AgentThread | null> {
        return this.readThreadFromMemory(threadUid) ?? null;
    }

    async syncThread(threadUid: string, payload: Partial<AgentThread> = {}) {
        const existing = this.readThreadFromMemory(threadUid);
        const now = Date.now();

        const next: AgentThread = {
            thread_uid: threadUid,
            checkpoint_id: payload.checkpoint_id ?? existing?.checkpoint_id,
            model: payload.model ?? existing?.model,
            provider: payload.provider ?? existing?.provider,
            state: {
                messages: payload.state?.messages ?? existing?.state?.messages ?? [],
                steps: payload.state?.steps ?? existing?.state?.steps ?? [],
                contexts: payload.state?.contexts ?? existing?.state?.contexts ?? [],
                memories: payload.state?.memories ?? existing?.state?.memories ?? [],
                cycles: payload.state?.cycles ?? existing?.state?.cycles ?? [],
                global_cycle: payload.state?.global_cycle ?? existing?.state?.global_cycle ?? 0,
            },
            created_at: existing?.created_at ?? payload.created_at ?? now,
            updated_at: payload.updated_at ?? now,
        };

        this.syncThreadMemory(next);
        return this.thread_memory_uid(threadUid);
    }

    async deleteThread(threadUid: string) {
        const existing = this.readThreadFromMemory(threadUid);
        if (!existing) return false;

        KernelEngine.deleteMemory(this.thread_memory_uid(threadUid));
        const nextIndex = { ...this.readThreadIndexFromMemory() };
        delete nextIndex[threadUid];
        this.syncThreadIndex(nextIndex);

        KernelEngine.deleteMemory(this.thread_runtime_memory_uid(threadUid));
        KernelEngine.deleteMemory(this.thread_ephemeral_memory_uid(threadUid));
        return true;
    }

    // + --------------- THREAD PROMPT ------------------- +

    async startThreadPrompt(
        threadUid: string,
        prompt: string,
        overrides: Partial<AgentConfigurableType> = {},
    ) {
        // Clear stale ephemeral from previous prompt
        KernelEngine.updateMemory(this.thread_ephemeral_memory_uid(threadUid), []);

        // Optimistic: mark streaming before the RPC round-trip so UI reacts instantly.
        KernelEngine.writeMemory(this.thread_runtime_memory_uid(threadUid), {
            is_streaming: true,
        } as AgentClientThreadRuntimeState);

        // Send to background — stream events will handle the rest
        const result = (await RPCEngine.invoke(
            'ai.startThreadPrompt',
            {
                thread_uid: threadUid,
                prompt,
                overrides,
                context: await resolveAgentInvokeContext(),
            },
            { timeoutMs: 0 },
        )) as { ok: boolean; started: boolean; thread_uid: string };

        return result;
    }

    async stopThreadPrompt(threadUid: string) {
        return ((await RPCEngine.invoke('ai.stopThreadPrompt', {
            thread_uid: threadUid,
        })) ?? false) as boolean;
    }

    // + --------------- HEALTH CHECK ------------------- +

    /**
     * Periodically checks if a thread is still running on the background.
     * If the background process died or the stream was lost, this will
     * detect it and update the runtime state accordingly.
     */
    async healthCheckThread(threadUid: string): Promise<boolean> {
        try {
            const isRunning = (await RPCEngine.invoke('ai.isThreadRunning', {
                thread_uid: threadUid,
            }, { timeoutMs: 3000 })) as boolean;

            if (!isRunning) {
                // Background confirms not running — ensure runtime reflects this.
                const current = KernelEngine.readMemory(
                    this.thread_runtime_memory_uid(threadUid),
                ) as AgentClientThreadRuntimeState | undefined;

                if (current?.is_streaming) {
                    KernelEngine.writeMemory(this.thread_runtime_memory_uid(threadUid), {
                        is_streaming: false,
                        last_error: 'Stream ended unexpectedly (health check)',
                        last_event_at: Date.now(),
                    } as AgentClientThreadRuntimeState);
                }
            }

            return isRunning;
        } catch {
            // RPC failed — background is unreachable.
            KernelEngine.writeMemory(this.thread_runtime_memory_uid(threadUid), {
                is_streaming: false,
                last_error: 'Background unreachable',
                last_event_at: Date.now(),
            } as AgentClientThreadRuntimeState);
            return false;
        }
    }

    // + --------------- RAW STATE HYDRATION ------------- +

    /**
     * Fetches raw agent workflow state from LangGraph checkpointer.
     * Returns the full state (goals, steps, thoughts, etc.) without
     * converting to AgentChatTurn[] — useful for debug tools and
     * inspecting the agent's internal reasoning.
     */
    async readRawState(threadUid: string): Promise<AceWorkflowState | null> {
        return (await RPCEngine.invoke('ai.readThread', {
            thread_uid: threadUid,
        })) as AceWorkflowState | null;
    }

    /**
     * Fetches raw AceWorkflowState from LangGraph checkpointer
     * and formats it into AgentChatTurn[], then stores locally.
     */
    async syncCurrentThreadFromBackground(threadUid: string): Promise<AgentThread | null> {
        const rawState = (await RPCEngine.invoke('ai.readThread', {
            thread_uid: threadUid,
        })) as AceWorkflowState | null;

        if (!rawState || !Array.isArray(rawState.messages)) {
            return this.readThreadFromMemory(threadUid) ?? null;
        }

        const messages: AgentChatTurn[] = normalizeMessages(rawState.messages);
        const existing = this.readThreadFromMemory(threadUid);

        // In dev mode, inject full workflow state for debugging (but keep normalized messages)
        const devState: Record<string, unknown> = (import.meta as any).env?.PROD !== true
            ? { ...rawState, messages }
            : { messages };

        const thread: AgentThread = {
            thread_uid: threadUid,
            checkpoint_id: existing?.checkpoint_id,
            model: existing?.model,
            provider: existing?.provider,
            state: devState as any,
            created_at: existing?.created_at ?? Date.now(),
            updated_at: Date.now(),
        };

        this.syncThreadMemory(thread);
        return thread;
    }

    // + --------------- MEMORY HELPERS ------------------ +

    readThreadFromMemory(threadUid: string): AgentThread | undefined {
        return KernelEngine.readMemory(this.thread_memory_uid(threadUid)) as
            | AgentThread
            | undefined;
    }

    readThreadIndexFromMemory(): Record<string, string> {
        return (
            (KernelEngine.readMemory(this.thread_uids_memory_uid) as
                | Record<string, string>
                | undefined) ?? {}
        );
    }

    syncThreadMemory(thread: AgentThread) {
        const memoryUid = this.thread_memory_uid(thread.thread_uid);
        const existingThread = KernelEngine.readMemory(memoryUid) as AgentThread | undefined;

        const nextThread: AgentThread = {
            ...existingThread,
            ...thread,
        };

        if (existingThread === undefined) {
            KernelEngine.registerSystemMemory(memoryUid, nextThread);
        } else {
            KernelEngine.writeMemory(memoryUid, nextThread);
        }

        const currentIndex = this.readThreadIndexFromMemory();
        if (currentIndex[thread.thread_uid] !== memoryUid) {
            KernelEngine.writeMemory(this.thread_uids_memory_uid, {
                ...currentIndex,
                [thread.thread_uid]: memoryUid,
            });
        }

        return memoryUid;
    }

    // + --------------- CONFIG SYNC --------------------- +

    async getBackgroundStatus() {
        return (
            (await window.electronAPI?.backgroundStatus()) ?? {
                active: false,
                runtime_mode: 'desktop',
                pid: null,
            }
        );
    }

    async syncConfigFromBackground() {
        await ConfigEngine.syncConfigFileToRam('ai');
        return ConfigEngine.getConfigItems<Record<string, unknown>>('ai');
    }
}

export const AgentClientEngine = new AgentClientEngineSingleton();
