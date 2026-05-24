import { HumanMessage } from '@langchain/core/messages';
import { AIProviders } from '#/shared/constants/ai.ts';

import type {
    AgentConfigurableType,
    AgentInvokeContextType,
    AgentThreadSnapshotType,
    AgentThread,
    AgentThreadSyncPayloadType,
    AIProviderType,
} from '#/shared/schemas/ai.ts';


import SingletonAgentInstance from './ai/agent-instance';
import { createAIStreamEventBridge } from './ai/ai-stream-events';
import resolveApiKey from '../lib/utils/ai/resolve-api-key';
import { ConfigEngine } from '#/shared/engines/config-engine';
import { Engine } from '#/shared/engines/engine';
import { EventBus } from '#/shared/engines/event-engine';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import { RPCEngine } from '#/shared/engines/rpc-engine';
import {
    AI_THREAD_STREAM_EVENT_SLUG,
    type BackgroundAIStreamEventPayloadType,
} from '#/shared/schemas/ai.ts';

const OPENROUTER_MODELS_ENDPOINT = 'https://openrouter.ai/api/v1/models';

class AIEngineSingleton extends Engine {
    public ai_threads_uids_memory_uid = 'system:ai_engine:thread:uids';
    public ai_threads_memory_uid = (thread_uid: string) => `system:ai_engine:thread:${thread_uid}`;
    private activeThreadRuns = new Map<
        string,
        {
            controller: AbortController;
            promise: Promise<AgentThread | null>;
            started_at: number;
        }
    >();

    private emitThreadStreamEvent(payload: BackgroundAIStreamEventPayloadType) {
        void EventBus.emit(AI_THREAD_STREAM_EVENT_SLUG, {
            payload: payload as unknown as Record<string, unknown>,
        }, {
            target: 'desktop',
        });
    }

    private emitProtocolThreadEvent(thread_uid: string, message: Record<string, unknown>) {
        this.emitThreadStreamEvent({
            thread_uid,
            message: message as never,
        });
    }

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

    async setupRpcRoutes() {
        await RPCEngine.handle('ai.fetchAvailableModels', async (payload: { provider?: string }) => {
            return await this.fetchAvailableModels(String(payload.provider || 'openai') as never);
        }, { owner: this.constructor.name });

        await RPCEngine.handle('ai.syncAvailableModels', async (payload: { provider?: string }) => {
            return await this.syncAvailableModels(String(payload.provider || 'openai') as never);
        }, { owner: this.constructor.name });

        await RPCEngine.handle('ai.listThreads', async () => {
            return this.listThreads();
        }, { owner: this.constructor.name });

        await RPCEngine.handle('ai.createThread', async (payload: { initialState?: Record<string, unknown> }) => {
            return this.createThread((payload.initialState as Record<string, unknown>) ?? {});
        }, { owner: this.constructor.name });

        await RPCEngine.handle('ai.readThread', async (payload: { thread_uid?: string }) => {
            return this.readThread(String(payload.thread_uid || ''));
        }, { owner: this.constructor.name });

        await RPCEngine.handle('ai.syncThread', async (payload: { thread_uid?: string; thread?: Record<string, unknown> }) => {
            return this.syncThread(
                String(payload.thread_uid || ''),
                (payload.thread as Record<string, unknown>) ?? {},
            );
        }, { owner: this.constructor.name });

        await RPCEngine.handle('ai.streamThreadPrompt', async (payload: {
            thread_uid?: string;
            prompt?: string;
            overrides?: Record<string, unknown>;
            context?: Record<string, unknown>;
        }) => {
            return await this.streamThreadPrompt(
                String(payload.thread_uid || ''),
                String(payload.prompt || ''),
                (payload.overrides as Record<string, unknown>) ?? {},
                payload.context,
            );
        }, { owner: this.constructor.name });

        await RPCEngine.handle('ai.startThreadPrompt', async (payload: {
            thread_uid?: string;
            prompt?: string;
            overrides?: Record<string, unknown>;
            context?: Record<string, unknown>;
        }) => {
            return await this.startThreadPrompt(
                String(payload.thread_uid || ''),
                String(payload.prompt || ''),
                (payload.overrides as Record<string, unknown>) ?? {},
                payload.context,
            );
        }, { owner: this.constructor.name });

        await RPCEngine.handle('ai.stopThreadPrompt', async (payload: { thread_uid?: string }) => {
            return await this.stopThreadPrompt(String(payload.thread_uid || ''));
        }, { owner: this.constructor.name });

        await RPCEngine.handle('ai.deleteThread', async (payload: { thread_uid?: string }) => {
            return await this.deleteThread(String(payload.thread_uid || ''));
        }, { owner: this.constructor.name });
    }

    async setupKernelSpace() {
        KernelEngine.registerSystemMemory(
            this.ai_threads_uids_memory_uid,
            {} as Record<string, unknown>,
        );
    }

    async setupKernelTerminationHook() {}

    // + ----- API Provider ----------------------------------------------------------------------------+

    private async fetchProviderModelsResponse(provider: AIProviderType): Promise<unknown> {
        try {
            const response = await fetch(OPENROUTER_MODELS_ENDPOINT, {
                headers: {
                    Accept: 'application/json',
                },
            });

            if (!response.ok) {
                this.log(
                    `[AIEngine] Failed to fetch OpenRouter models for provider "${provider}".`,
                    response.status,
                    response.statusText,
                );
                return null;
            }

            return await response.json();
        } catch (error) {
            this.log(
                `[AIEngine] Failed to reach OpenRouter model registry for provider "${provider}".`,
                error,
            );
            return null;
        }
    }

    public async fetchAvailableModels(provider: AIProviderType): Promise<string[]> {
        const payload = await this.fetchProviderModelsResponse(provider);
        return this.resolveModelNamesFromResponse(payload, provider);
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

    private resolveModelNamesFromResponse(payload: unknown, provider: AIProviderType): string[] {
        if (!payload || typeof payload !== 'object') {
            return [];
        }

        const record = payload as Record<string, unknown>;
        const sources = [record.data, record.models];
        const providerPrefix = `${provider}/`;

        return Array.from(
            new Set(
                sources
                    .flatMap((source) => (Array.isArray(source) ? source : []))
                    .map((candidate) => this.resolveModelName(candidate))
                    .filter((modelName): modelName is string => Boolean(modelName))
                    .filter((modelName) => modelName.startsWith(providerPrefix))
                    .map((modelName) => modelName.slice(providerPrefix.length))
                    .filter((modelName): modelName is string => Boolean(modelName)),
            ),
        ).sort();
    }

    public async syncAvailableModels(provider: AIProviderType): Promise<string[]> {
        const models = await this.fetchAvailableModels(provider);
        const currentProviderModels = ConfigEngine.getConfigItem<Record<string, string[]>>(
            'ai',
            'ai.providers_models',
        );

        const nextProviderModels: Record<string, string[]> = {
            ...(currentProviderModels ?? {}),
            [provider]: models,
        };

        await ConfigEngine.updateConfigItem('ai', 'ai.providers_models', nextProviderModels);
        await ConfigEngine.syncConfigRamToFile('ai');

        return models;
    }

    // + ----- API Threads DeepAgents ----------------------------------------------------------------------------+

    public async streamThreadPrompt(
        thread_uid: string,
        prompt: string,
        overrides: Partial<AgentConfigurableType> = {},
        context?: Record<string, unknown>,
        signal?: AbortSignal,
    ) {
        const normalizedPrompt = prompt.trim();
        if (!normalizedPrompt) {
            return this.readThread(thread_uid);
        }

        const existingThread = this.readThread(thread_uid);
        const provider =
            overrides.provider ??
            existingThread?.provider ??
            (ConfigEngine.getConfigItem<AIProviderType>('ai', 'ai.default_provider') as AIProviderType | undefined) ??
            AIProviders.OPENAI;
        const model =
            overrides.model ??
            existingThread?.model ??
            (ConfigEngine.getConfigItem<string>('ai', 'ai.default_model') as string | undefined);
        const apiKey = overrides.apiKey ?? (await resolveApiKey(provider)) ?? undefined;
        const checkpoint_id = overrides.checkpoint_id ?? existingThread?.checkpoint_id;

        this.syncThread(thread_uid, {
            thread_uid,
            checkpoint_id,
            model,
            provider,
            updated_at: Date.now(),
        });

        const streamRuntimeConfig = {
            version: 'v3' as const,
            ...(context ? { context: context as unknown as AgentInvokeContextType } : {}),
            configurable: {
                thread_id: thread_uid,
                // checkpoint_id,
                model,
                provider,
                apiKey,
                ...overrides,
            },
            ...(signal ? { signal } : {}),
        };

        const stream = await SingletonAgentInstance.getInstance().stream(
            {
                messages: [
                    new HumanMessage(normalizedPrompt),
                ],
            },
            streamRuntimeConfig,
        );

        const run_id = crypto.randomUUID();
        const streamEvents = createAIStreamEventBridge({
            threadUid: thread_uid,
            runId: run_id,
            emitProtocolThreadEvent: (nextThreadUid, message) => {
                this.emitProtocolThreadEvent(nextThreadUid, message);
            },
        });

        streamEvents.start();

        try {
            for await (const event of stream) {
                streamEvents.process(event);
            }

            streamEvents.complete();
        } catch (error) {
            streamEvents.fail(error);
            throw error;
        }

        return this.readThread(thread_uid);
    }

    public async startThreadPrompt(
        thread_uid: string,
        prompt: string,
        overrides: Partial<AgentConfigurableType> = {},
        context?: Record<string, unknown>,
    ) {
        const normalizedPrompt = prompt.trim();
        if (!thread_uid || !normalizedPrompt) {
            return {
                ok: false,
                started: false,
                thread_uid,
            };
        }

        const existingRun = this.activeThreadRuns.get(thread_uid);
        if (existingRun) {
            return {
                ok: true,
                started: false,
                thread_uid,
                already_running: true,
                started_at: existingRun.started_at,
            };
        }

        const controller = new AbortController();
        const runPromise = this.streamThreadPrompt(
            thread_uid,
            normalizedPrompt,
            overrides,
            context,
            controller.signal,
        )
            .catch((error) => {
                this.log(`[AIEngine] thread run failed for ${thread_uid}:`, error);
                return this.readThread(thread_uid);
            })
            .finally(() => {
                const currentRun = this.activeThreadRuns.get(thread_uid);
                if (currentRun?.promise === runPromise) {
                    this.activeThreadRuns.delete(thread_uid);
                }
            });

        this.activeThreadRuns.set(thread_uid, {
            controller,
            promise: runPromise,
            started_at: Date.now(),
        });

        return {
            ok: true,
            started: true,
            thread_uid,
            started_at: Date.now(),
        };
    }

    public async stopThreadPrompt(thread_uid: string) {
        const activeRun = this.activeThreadRuns.get(thread_uid);
        if (!activeRun) {
            return false;
        }

        activeRun.controller.abort(new Error(`Thread ${thread_uid} aborted by user.`));
        await activeRun.promise;
        return true;
    }


    // + ----- API Threads ----------------------------------------------------------------------------+

    public createThread(
        initialState: Partial<AgentThreadSnapshotType> = {
            model: ConfigEngine.getConfigItem<string>('ai', 'ai.default_model'),
            provider: ConfigEngine.getConfigItem<AIProviderType>('ai', 'ai.default_provider'),
        },
    ): AgentConfigurableType {
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

    public syncThread(thread_uid: string, payload: AgentThreadSyncPayloadType = {}): string {
        const memory_uid = this.ensureThreadIndex(thread_uid);
        const existingThread = KernelEngine.readMemory(memory_uid) as AgentThread | undefined;
        const now = Date.now();

        const nextSnapshot: AgentThreadSnapshotType = {
            thread_uid,
            checkpoint_id: payload.checkpoint_id ?? existingThread?.checkpoint_id,
            model: payload.model ?? existingThread?.model,
            provider: payload.provider ?? existingThread?.provider,
            messages:
                Array.isArray(payload.messages) && Array.isArray(existingThread?.messages)
                    ? payload.messages.length >= existingThread.messages.length
                        ? payload.messages
                        : existingThread.messages
                    : payload.messages ?? existingThread?.messages ?? [],
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

    public listThreads() {
        const index = this.readThreadIndex();
        const threads = Object.entries(index)
            .map(([thread_uid, memory_uid]) => {
                const thread = KernelEngine.readMemory(memory_uid) as AgentThread | undefined;

                if (!thread) {
                    return null;
                }

                return {
                    thread_uid,
                    memory_uid,
                    thread,
                };
            })
            .filter(
                (
                    entry,
                ): entry is {
                    thread_uid: string;
                    memory_uid: string;
                    thread: AgentThread;
                } => Boolean(entry),
            );

        return {
            index,
            threads,
        };
    }

    public readThread(thread_uid: string): AgentThread | null {
        const memory_uid = this.readThreadIndex()[thread_uid] ?? this.ai_threads_memory_uid(thread_uid);

        return ((KernelEngine.readMemory(memory_uid) as AgentThread | undefined) ?? null);
    }

    public async deleteThread(thread_uid: string): Promise<boolean> {
        const currentIndex = this.readThreadIndex();
        const memory_uid = currentIndex[thread_uid] ?? this.ai_threads_memory_uid(thread_uid);
        const existingThread = KernelEngine.readMemory(memory_uid);

        if (!existingThread && !currentIndex[thread_uid]) {
            return false;
        }

        if (existingThread) {
            KernelEngine.deleteMemory(memory_uid);
        }

        if (currentIndex[thread_uid]) {
            const nextIndex = { ...currentIndex };
            delete nextIndex[thread_uid];
            KernelEngine.writeMemory(this.ai_threads_uids_memory_uid, nextIndex);
        }

        return true;
    }
}

export const AIEngine = new AIEngineSingleton();
