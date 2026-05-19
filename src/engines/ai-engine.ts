import { AIProviders } from '#/constants/ai.ts';
import type {
    AgentConfigurable,
    AgentThreadSnapshot,
    AgentThread,
    AgentThreadSyncPayload,
    AIProviderType,
} from '#/schemas/ai.ts';
import resolveApiKey from './ai/resolve-api-key';
import { ConfigEngine } from './config-engine';
import { Engine } from './engine';
import { KernelEngine } from './kernel-engine';

class AIEngineSingleton extends Engine {
    public ai_threads_uids_memory_uid = 'system:ai_engine:thread:uids';
    public ai_threads_memory_uid = (thread_uid: string) => `system:ai_engine:thread:${thread_uid}`;

    private readThreadIndex(): Record<string, string> {
        return (
            (KernelEngine.readMemory(this.ai_threads_uids_memory_uid) as
                | Record<string, string>
                | undefined) ?? {}
        );
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

    private async fetchProviderModelsResponse(provider: AIProviderType): Promise<unknown> {
        const apiKey = await resolveApiKey(provider);

        if (!apiKey) {
            this.log(`[AIEngine] No API key found for provider "${provider}". Skipping model fetch.`);
            return null;
        }

        switch (provider) {
            case AIProviders.OPENAI:
                return await fetch('https://api.openai.com/v1/models', {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                }).then((res) => res.json());
            case AIProviders.GOOGLE:
                return await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
                    headers: {
                        'x-goog-api-key': apiKey,
                        'Content-Type': 'application/json',
                    },
                }).then((res) => res.json());
            case AIProviders.ANTHROPIC:
                return await fetch('https://api.anthropic.com/v1/models', {
                    headers: {
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                        'Content-Type': 'application/json',
                    },
                }).then((res) => res.json());
            default:
                return null;
        }
    }

    public async fetchAvailableModels(provider: AIProviderType): Promise<string[]> {
        const payload = await this.fetchProviderModelsResponse(provider);
        this.log(`[AIEngine] Fetched models response for provider "${provider}":`, payload);
        return this.resolveModelNamesFromResponse(payload);
    }

    private resolveModelName(candidate: unknown): string | null {
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.replace(/^models\//, '');
        }

        if (!candidate || typeof candidate !== 'object') {
            return null;
        }

        const record = candidate as Record<string, unknown>;
        const resolvedName =
            typeof record.id === 'string'
                ? record.id
                : typeof record.name === 'string'
                  ? record.name
                  : null;

        return resolvedName?.replace(/^models\//, '') ?? null;
    }

    private resolveModelNamesFromResponse(payload: unknown): string[] {
        if (!payload || typeof payload !== 'object') {
            return [];
        }

        const record = payload as Record<string, unknown>;
        const sources = [record.data, record.models];

        return Array.from(
            new Set(
                sources
                    .flatMap((source) => (Array.isArray(source) ? source : []))
                    .map((candidate) => this.resolveModelName(candidate))
                    .filter((modelName): modelName is string => Boolean(modelName)),
            ),
        ).sort();
    }

    public async syncAvailableModels(provider: AIProviderType): Promise<string[]> {
        const models = await this.fetchAvailableModels(provider);
        const currentProviderModels = ConfigEngine.getConfigItem('ai', 'ai.providers_models')
            ?.value as Record<string, string[]> | undefined;

        const nextProviderModels: Record<string, string[]> = {
            ...(currentProviderModels ?? {}),
            [provider]: models,
        };

        await ConfigEngine.updateConfigItem('ai', 'ai.providers_models', nextProviderModels);
        await ConfigEngine.syncConfigRamToFile('ai');

        return models;
    }

    // + ----- API Threads ----------------------------------------------------------------------------+

    public createThread(
        initialState: Partial<AgentThreadSnapshot> = {
            model: ConfigEngine.getConfigItem('ai', 'ai.default_model')?.value,
            provider: ConfigEngine.getConfigItem('ai', 'ai.default_provider')?.value,
        },
    ): AgentConfigurable {
        const thread_id = initialState.thread_uid ?? crypto.randomUUID();

        this.syncThread(thread_id, initialState);

        return {
            thread_id,
            checkpoint_id: initialState.checkpoint_id,
            model: initialState.model,
            provider: initialState.provider,
            apiKey: undefined,
        };
    }

    public syncThread(thread_uid: string, payload: AgentThreadSyncPayload = {}): string {
        const memory_uid = this.ensureThreadIndex(thread_uid);
        const existingThread = KernelEngine.readMemory(memory_uid) as AgentThread | undefined;
        const now = Date.now();

        const nextSnapshot: AgentThreadSnapshot = {
            thread_uid,
            checkpoint_id: payload.checkpoint_id ?? existingThread?.checkpoint_id,
            model: payload.model ?? existingThread?.model,
            provider: payload.provider ?? existingThread?.provider,
            messages: payload.messages ?? existingThread?.messages ?? [],
            state: payload.state ?? existingThread?.state ?? {},
            created_at: existingThread?.created_at ?? payload.created_at ?? now,
            updated_at: payload.updated_at ?? now,
        };

        const nextThread: AgentThread = {
            ...nextSnapshot,
            snapshot: payload.snapshot ?? nextSnapshot,
        };

        if (existingThread) {
            KernelEngine.updateMemory(memory_uid, nextThread);
        } else {
            KernelEngine.registerSystemMemory(memory_uid, nextThread);
        }

        return memory_uid;
    }

    public readThread(thread_uid: string): AgentThread | null {
        return (
            (KernelEngine.readMemory(this.ai_threads_memory_uid(thread_uid)) as
                | AgentThread
                | undefined) ?? null
        );
    }
}

export const AIEngine = new AIEngineSingleton();
