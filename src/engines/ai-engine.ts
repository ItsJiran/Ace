import type { AgentConfigurable, AgentThreadSnapshot } from '#/schemas/ai.ts';
import { Engine } from './engine';
import { KernelEngine } from './kernel-engine';

class AIEngineSingleton extends Engine {
    public ai_threads_uids_memory_uid = 'system:ai_engine:thread:uids';
    public ai_threads_memory_uid = (thread_uid: string) => `system:ai_engine:thread:${thread_uid}`;

    private readThreadIndex(): Record<string, string> {
        return (KernelEngine.readMemory(this.ai_threads_uids_memory_uid) as Record<string, string> | undefined) ?? {};
    }

    private ensureThreadIndex(thread_uid: string): string {
        const memory_uid = this.ai_threads_memory_uid(thread_uid);
        const currentIndex = this.readThreadIndex();

        if (currentIndex[thread_uid] !== memory_uid) {
            KernelEngine.updateMemory(this.ai_threads_uids_memory_uid, {
                [thread_uid]: memory_uid,
            });
        }

        return memory_uid;
    }

    // + ----- Abstract Methods ---------------------------------------------------------------+

    async boot() {}

    async setupEventRoutes() {}

    async setupKernelSpace() {
        KernelEngine.registerSystemMemory(
            this.ai_threads_uids_memory_uid,
            {} as Record<string, unknown>,
        );
    }

    async setupKernelTerminationHook() {}

    // + ----- API Provider ----------------------------------------------------------------------------+


    // + ----- API Threads ----------------------------------------------------------------------------+

    public createAIThread(initialState: Partial<AgentThreadSnapshot> = {}): AgentConfigurable {
        const thread_id = initialState.thread_uid ?? crypto.randomUUID();

        this.syncAIThread(thread_id, initialState);

        return {
            thread_id,
            checkpoint_id: initialState.checkpoint_id,
            model: initialState.model,
            provider: initialState.provider,
            allowedTool: initialState.allowedTool ?? [],
            apiKey: undefined,
        };
    }

    public syncAIThread(thread_uid: string, payload: Partial<AgentThreadSnapshot> = {}): string {
        const memory_uid = this.ensureThreadIndex(thread_uid);
        const existingThread = KernelEngine.readMemory(memory_uid) as AgentThreadSnapshot | undefined;
        const now = Date.now();

        const nextThread: AgentThreadSnapshot = {
            thread_uid,
            checkpoint_id: payload.checkpoint_id ?? existingThread?.checkpoint_id,
            model: payload.model ?? existingThread?.model,
            provider: payload.provider ?? existingThread?.provider,
            allowedTool: payload.allowedTool ?? existingThread?.allowedTool ?? [],
            messages: payload.messages ?? existingThread?.messages ?? [],
            state: payload.state ?? existingThread?.state ?? {},
            created_at: existingThread?.created_at ?? payload.created_at ?? now,
            updated_at: payload.updated_at ?? now,
        };

        if (existingThread) {
            KernelEngine.updateMemory(memory_uid, nextThread);
        } else {
            KernelEngine.registerSystemMemory(memory_uid, nextThread);
        }

        return memory_uid;
    }

    public readAIThread(thread_uid: string): AgentThreadSnapshot | null {
        return (KernelEngine.readMemory(this.ai_threads_memory_uid(thread_uid)) as AgentThreadSnapshot | undefined) ?? null;
    }

}

export const AIEngine = new AIEngineSingleton();
