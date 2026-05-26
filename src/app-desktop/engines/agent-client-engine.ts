import { Engine } from '#/shared/engines/engine';
import { ConfigEngine } from '#/shared/engines/config-engine';
import { DefaultConfigAI } from '#/shared/constants/config';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import { RPCEngine } from '#/shared/engines/rpc-engine';
import type {
    AgentThread,
    AgentThreadSnapshotType,
    AgentThreadSyncPayloadType,
    AgentConfigurableType,
    AIProviderType,
} from '#/shared/schemas/ai';
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

class AgentClientEngineSingleton extends Engine {
    public readonly memory_uid = DefaultConfigAI.memory_uid;
    public readonly thread_uids_memory_uid = 'system:ai_engine:thread:uids';

    public readonly thread_memory_uid = (thread_uid: string) =>
        `system:ai_engine:thread:${thread_uid}`;

    // + --------------- ABSTRACT METHODS ----------------- +

    async boot() {
        await this.syncAIMemory();
    }

    async setupEventRoutes() {}
    async setupKernelSpace() {
        KernelEngine.registerSystemMemory(
            this.thread_uids_memory_uid,
            {} as Record<string, string>,
        );
    }
    async setupKernelTerminationHook() {}

    // + --------------- THREADS API METHODS --------------- +

    async fetchModels(provider: AIProviderType | string) {
        const models = ((await RPCEngine.invoke('ai.syncAvailableModels', {
            provider: String(provider),
        })) ?? []) as string[];
        await this.syncConfigFromBackground();
        return models;
    }

    // + --------------- THREADS API METHODS --------------- +

    syncThreadIndex(index: Record<string, string>) {
        KernelEngine.writeMemory(this.thread_uids_memory_uid, index);
        return index;
    }

    async listThreads() {
        const payload = await this.syncAIMemory();
        return payload.threads ?? [];
    }

    async createThread(initialState: Partial<AgentThreadSnapshotType> = {}) {
        const thread = ((await RPCEngine.invoke('ai.createThread', {
            initialState: initialState as Record<string, unknown>,
        })) ?? {
            thread_id: initialState.thread_uid ?? crypto.randomUUID(),
        }) as AgentConfigurableType;
        await this.syncCurrentThreadFromBackground(thread.thread_id);
        return thread;
    }

    async readThread(threadUid: string) {
        return await this.syncCurrentThreadFromBackground(threadUid);
    }

    async syncThread(threadUid: string, payload: AgentThreadSyncPayloadType = {}) {
        const memoryUid = ((await RPCEngine.invoke('ai.syncThread', {
            thread_uid: threadUid,
            thread: payload as Record<string, unknown>,
        })) ?? '') as string;

        await this.syncCurrentThreadFromBackground(threadUid);
        return memoryUid;
    }

    async startThreadPrompt(
        threadUid: string,
        prompt: string,
        overrides: Partial<AgentConfigurableType> = {},
    ) {
        const thread = ((await RPCEngine.invoke('ai.startThreadPrompt', {
            thread_uid: threadUid,
            prompt,
            overrides,
            context: await resolveAgentInvokeContext(),
        }, {
            timeoutMs: 0,
        })) ?? null) as AgentThread | null;

        if (thread) {
            return await this.syncCurrentThreadFromBackground(threadUid);
        }

        return await this.syncCurrentThreadFromBackground(threadUid);
    }

    async stopThreadPrompt(threadUid: string) {
        return ((await RPCEngine.invoke('ai.stopThreadPrompt', {
            thread_uid: threadUid,
        })) ?? false) as boolean;
    }

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

        return true;
    }

    // + ----------- THREADS MEMORIES METHODS -------------- +

    readThreadFromMemory(threadUid: string) {
        return KernelEngine.readMemory(this.thread_memory_uid(threadUid)) as
            | AgentThread
            | undefined;
    }

    readThreadIndexFromMemory() {
        return (
            (KernelEngine.readMemory(this.thread_uids_memory_uid) as
                | Record<string, string>
                | undefined) ?? {}
        );
    }

    syncThreadMemory(thread: AgentThread) {
        const memoryUid = this.thread_memory_uid(thread.thread_uid);
        const existingThread = KernelEngine.readMemory(memoryUid);

        if (existingThread === undefined) {
            KernelEngine.registerSystemMemory(memoryUid, thread);
        } else {
            KernelEngine.writeMemory(memoryUid, thread);
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

    async syncAIMemory() {
        await this.syncConfigFromBackground();

        const payload = ((await RPCEngine.invoke('ai.listThreads',{})) ?? {
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

    async syncCurrentThreadFromBackground(threadUid: string) {
        const thread = ((await RPCEngine.invoke('ai.readThread', {
            thread_uid: threadUid,
        })) ?? null) as AgentThread | null;

        if (!thread) {
            return null;
        }

        this.syncThreadMemory(thread);
        return thread;
    }

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
