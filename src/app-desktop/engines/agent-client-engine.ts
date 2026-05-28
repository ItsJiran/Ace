import { Engine } from '#/shared/engines/engine';
import { ConfigEngine } from '#/shared/engines/config-engine';
import { DefaultConfigAI } from '#/shared/constants/config';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import { RPCEngine } from '#/shared/engines/rpc-engine';
import { EventBus } from '#/shared/engines/event-engine';
import type {
    AgentThread,
    AgentInterProcessSyncPayloadType,
    AgentConfigurableType,
    AIProviderType,
    BackgroundAIStreamEventPayloadType,
} from '#/shared/schemas/ai';

import { AgentClientThread, AgentClientThreadRuntimeState } from '#/shared/schemas/ai-client';

import { AI_THREAD_STREAM_EVENT_SLUG } from '#/shared/schemas/ai';
import { AgentThreadStreamHandlers } from './agent/agent-thread-stream-handlers';
import resolveAgentInvokeContext from './ai/resolve-agent-context';

type BackgroundThreadListEntryType = {
    thread_uid: string;
    memory_uid: string;
    thread: AgentThread;
};

type BackgroundThreadListPayloadType = {
    index: Record<string, string>;
    threads: BackgroundThreadListEntryType[];
};

// AgentClientEngine is the desktop-side control plane for AI threads.
//
// Responsibilities:
// 1) Mirror persisted threads from background RPC into Kernel memory.
// 2) Consume background stream protocol events once (centralized listener).
// 3) Maintain client-only ephemeral_items in thread memory for live UI status.
// 4) Enforce dedupe/order for stream packets (event_id + seq) to prevent duplicate UI updates.
//
// Agentic flow in this engine:
// - UI sends prompt -> startThreadPrompt()
// - background emits stream events -> setupEventRoutes() listener
// - listener forwards packets to AgentThreadStreamHandlers
// - handler module updates Kernel memory (runtime + ephemeral + final thread sync)
// - React hooks only read memory; they do not own stream side-effects.
class AgentClientEngineSingleton extends Engine {
    public readonly memory_uid = DefaultConfigAI.memory_uid;
    public readonly thread_uids_memory_uid = 'system:ai_engine:thread:uids';
    public readonly thread_runtime_memory_uid = 'system:ai_engine:thread:runtime';

    public readonly thread_memory_uid = (thread_uid: string) =>
        `system:ai_engine:thread:${thread_uid}`;

    private removeBackgroundAIThreadListener: (() => void) | null = null;

    private streamHandlers = new AgentThreadStreamHandlers({
        readThread: (threadUid) => this.readThreadFromMemory(threadUid),
        writeThread: (threadUid, thread) => {
            KernelEngine.writeMemory(this.thread_memory_uid(threadUid), thread);
        },
        readRuntimeMap: () => this.readThreadRuntimeMapFromMemory(),
        writeRuntimeMap: (runtimeMap) => {
            KernelEngine.writeMemory(this.thread_runtime_memory_uid, runtimeMap);
        },
        syncThreadFromBackground: async (threadUid) => {
            await this.syncCurrentThreadFromBackground(threadUid);
        },
    });

    // + --------------- ABSTRACT METHODS ----------------- +

    // Initial hydration when the engine boots.
    // This keeps desktop thread memory ready before chat UI mounts.
    async boot() {
        await this.syncAIMemory();
    }

    // One global EventBus subscription for AI thread stream events.
    // Centralization here avoids duplicate listeners when multiple hooks/components are active.
    async setupEventRoutes() {
        if (this.removeBackgroundAIThreadListener) {
            return;
        }

        this.removeBackgroundAIThreadListener = EventBus.listen<BackgroundAIStreamEventPayloadType>(
            AI_THREAD_STREAM_EVENT_SLUG,
            (event) => {
                const payload = event?.payload;

                if (!payload) {
                    return;
                }

                void this.streamHandlers.handlePayload(payload);
            },
        );
    }

    // Registers stable Kernel memory buckets used by the desktop runtime.
    async setupKernelSpace() {
        KernelEngine.registerSystemMemory(
            this.thread_uids_memory_uid,
            {} as Record<string, string>,
        );

        KernelEngine.registerSystemMemory(
            this.thread_runtime_memory_uid,
            {} as Record<string, AgentClientThreadRuntimeState>,
        );
    }

    // Cleanup runtime listeners/caches when kernel shuts down.
    async setupKernelTerminationHook() {
        if (this.removeBackgroundAIThreadListener) {
            this.removeBackgroundAIThreadListener();
            this.removeBackgroundAIThreadListener = null;
        }
    }

    // + --------------- THREADS API METHODS --------------- +

    // Resolve provider models from background and refresh AI config snapshot in RAM.
    async fetchModels(provider: AIProviderType | string) {
        const models = ((await RPCEngine.invoke('ai.syncAvailableModels', {
            provider: String(provider),
        })) ?? []) as string[];
        await this.syncConfigFromBackground();
        return models;
    }

    // + --------------- THREADS API METHODS --------------- +

    // Writes thread_uid -> memory_uid index used by desktop selectors.
    syncThreadIndex(index: Record<string, string>) {
        KernelEngine.writeMemory(this.thread_uids_memory_uid, index);
        return index;
    }

    // Returns latest thread list after forcing a background sync.
    async listThreads() {
        const payload = await this.syncAIMemory();
        return payload.threads ?? [];
    }

    // Creates a background thread, then mirrors it into desktop memory.
    async createThread(initialState: Partial<AgentThread> = {}) {
        const threadState =
            initialState.state && typeof initialState.state === 'object'
                ? initialState.state
                : { messages: [] };
        const thread = ((await RPCEngine.invoke('ai.createThread', {
            initialState: {
                ...initialState,
                state: threadState,
            } as Record<string, unknown>,
        })) ?? {
            thread_id: initialState.thread_uid ?? crypto.randomUUID(),
        }) as AgentConfigurableType;
        await this.syncCurrentThreadFromBackground(thread.thread_id);
        return thread;
    }

    // Reads one thread from background and syncs local memory.
    async readThread(threadUid: string) {
        return await this.syncCurrentThreadFromBackground(threadUid);
    }

    // Persists thread updates to background then rehydrates local memory.
    async syncThread(threadUid: string, payload: AgentInterProcessSyncPayloadType = {}) {
        const memoryUid = ((await RPCEngine.invoke('ai.syncThread', {
            thread_uid: threadUid,
            thread: payload as Record<string, unknown>,
        })) ?? '') as string;

        await this.syncCurrentThreadFromBackground(threadUid);
        return memoryUid;
    }

    // Starts an agent run in background with runtime desktop context.
    // Final thread state is always fetched from background for consistency.
    async startThreadPrompt(
        threadUid: string,
        prompt: string,
        overrides: Partial<AgentConfigurableType> = {},
    ) {
        const thread = ((await RPCEngine.invoke(
            'ai.startThreadPrompt',
            {
                thread_uid: threadUid,
                prompt,
                overrides,
                context: await resolveAgentInvokeContext(),
            },
            {
                timeoutMs: 0,
            },
        )) ?? null) as AgentClientThread | null;

        if (thread) {
            return await this.syncCurrentThreadFromBackground(threadUid);
        }

        return await this.syncCurrentThreadFromBackground(threadUid);
    }

    // Sends interruption signal to background for an active thread run.
    async stopThreadPrompt(threadUid: string) {
        return ((await RPCEngine.invoke('ai.stopThreadPrompt', {
            thread_uid: threadUid,
        })) ?? false) as boolean;
    }

    // Deletes thread in background and cleans all local memory/dedupe caches.
    async deleteThread(threadUid: string) {
        const deleted = ((await RPCEngine.invoke('ai.deleteThread', {
            thread_uid: threadUid,
        })) ?? false) as boolean;
        if (!deleted) {
            return false;
        }

        KernelEngine.deleteMemory(this.thread_memory_uid(threadUid));
        const nextIndex = { ...this.readThreadIndexFromMemory() };
        delete nextIndex[threadUid];
        this.syncThreadIndex(nextIndex);

        const nextRuntime = { ...this.readThreadRuntimeMapFromMemory() };
        delete nextRuntime[threadUid];
        KernelEngine.writeMemory(this.thread_runtime_memory_uid, nextRuntime);

        return true;
    }

    // + ----------- THREADS MEMORIES METHODS -------------- +

    // Reads one client thread from Kernel memory.
    readThreadFromMemory(threadUid: string) {
        return KernelEngine.readMemory(this.thread_memory_uid(threadUid)) as
            | AgentClientThread
            | undefined;
    }

    // Reads thread index map from Kernel memory.
    readThreadIndexFromMemory() {
        return (
            (KernelEngine.readMemory(this.thread_uids_memory_uid) as
                | Record<string, string>
                | undefined) ?? {}
        );
    }

    // Reads per-thread runtime status map from Kernel memory.
    readThreadRuntimeMapFromMemory() {
        return (
            (KernelEngine.readMemory(this.thread_runtime_memory_uid) as
                | Record<string, AgentClientThreadRuntimeState>
                | undefined) ?? {}
        );
    }

    // + --------------- MEMORY SYNC METHODS -------------- +

    // Ensures persisted thread keeps client-owned ephemeral_items across background syncs.
    private resolveClientThread(
        thread: AgentThread,
        existingThread?: AgentClientThread,
    ): AgentClientThread {
        return {
            ...thread,
            ephemeral_items: existingThread?.ephemeral_items ?? [],
        };
    }

    // Writes a single thread snapshot into Kernel memory and updates thread index.
    syncThreadMemory(thread: AgentThread) {
        const memoryUid = this.thread_memory_uid(thread.thread_uid);
        const existingThread = KernelEngine.readMemory(memoryUid) as AgentClientThread | undefined;
        const nextThread = this.resolveClientThread(thread, existingThread);

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

    // Bulk sync entry point: loads all threads from background into local memory.
    async syncAIMemory() {
        await this.syncConfigFromBackground();

        const payload = ((await RPCEngine.invoke('ai.listThreads', {})) ?? {
            index: {},
            threads: [],
        }) as BackgroundThreadListPayloadType;

        this.syncThreadIndex(payload.index ?? {});
        for (const entry of payload.threads ?? []) {
            this.syncThreadMemory(entry.thread);
        }
        return payload;
    }

    // + ------------- BACKGROUND API METHODS -------------- +

    // Syncs one thread snapshot from background and returns the memory-backed client thread.
    async syncCurrentThreadFromBackground(threadUid: string) {
        const thread = ((await RPCEngine.invoke('ai.readThread', {
            thread_uid: threadUid,
        })) ?? null) as AgentThread | null;

        if (!thread) {
            return null;
        }

        this.syncThreadMemory(thread);
        return this.readThreadFromMemory(threadUid) ?? null;
    }

    // Small RPC helper for diagnostics and runtime health checks.
    async getBackgroundStatus() {
        return (
            (await window.electronAPI?.backgroundStatus()) ?? {
                active: false,
                runtime_mode: 'desktop',
                pid: null,
            }
        );
    }

    // Syncs AI config namespace into RAM before model/provider dependent operations.
    async syncConfigFromBackground() {
        await ConfigEngine.syncConfigFileToRam('ai');
        return ConfigEngine.getConfigItems<Record<string, unknown>>('ai');
    }
}

export const AgentClientEngine = new AgentClientEngineSingleton();
