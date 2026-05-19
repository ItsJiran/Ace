import { AIProviders } from '#/shared/constants/ai.ts';

import type {
    AgentConfigurable,
    AgentThreadSnapshot,
    AgentThread,
    AgentThreadSyncPayload,
    AIProviderType,
} from '#/shared/schemas/ai.ts';


import SingletonAgentInstance from './ai/agent-instance';
import resolveApiKey from './ai/resolve-api-key';
import { ConfigEngine } from '#/shared/engines/config-engine';
import { Engine } from '#/shared/engines/engine';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import { emitBackgroundAIStreamEvent } from './ai-stream-events';

const OPENROUTER_MODELS_ENDPOINT = 'https://openrouter.ai/api/v1/models';

function resolveStreamTextContent(content: unknown): string {
    if (typeof content === 'string') {
        return content;
    }

    if (Array.isArray(content)) {
        return content
            .map((item) => {
                if (typeof item === 'string') {
                    return item;
                }

                if (!item || typeof item !== 'object') {
                    return '';
                }

                const record = item as Record<string, unknown>;
                if (typeof record.text === 'string') {
                    return record.text;
                }

                if (typeof record.content === 'string') {
                    return record.content;
                }

                return '';
            })
            .join('');
    }

    if (content && typeof content === 'object') {
        const record = content as Record<string, unknown>;
        if (typeof record.content === 'string') {
            return record.content;
        }
        if (Array.isArray(record.content)) {
            return resolveStreamTextContent(record.content);
        }
    }

    return '';
}

function emitProtocolThreadEvent(thread_uid: string, message: Record<string, unknown>) {
    emitBackgroundAIStreamEvent({
        thread_uid,
        message: message as never,
    });
}

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
        overrides: Partial<AgentConfigurable> = {},
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

        const stream = await SingletonAgentInstance.getInstance().stream(
            {
                messages: [
                    {
                        role: 'user',
                        content: normalizedPrompt,
                    },
                ],
            },
            {
                version: 'v3',
                configurable: {
                    thread_id: thread_uid,
                    // checkpoint_id,
                    model,
                    provider,
                    apiKey,
                    ...overrides,
                },
            },
        );

        const run_id = crypto.randomUUID();
        let protocolSeq = 0;
        let activeAssistantMessageId: string | null = null;
        let activeAssistantText = '';
        let hasStartedAssistantBlock = false;

        const emitLifecycle = (event: 'started' | 'completed' | 'failed', error?: string) => {
            emitProtocolThreadEvent(thread_uid, {
                type: 'event',
                event_id: `${thread_uid}:${run_id}:${++protocolSeq}`,
                seq: protocolSeq,
                method: 'lifecycle',
                params: {
                    namespace: [],
                    timestamp: Date.now(),
                    data: {
                        event,
                        ...(error ? { error } : {}),
                    },
                },
            });
        };

        const ensureAssistantMessageStarted = (node?: string, metadata?: Record<string, unknown>) => {
            if (!activeAssistantMessageId) {
                activeAssistantMessageId = `assistant:${thread_uid}:${run_id}`;
                emitProtocolThreadEvent(thread_uid, {
                    type: 'event',
                    event_id: `${thread_uid}:${run_id}:${++protocolSeq}`,
                    seq: protocolSeq,
                    method: 'messages',
                    params: {
                        namespace: [],
                        timestamp: Date.now(),
                        ...(node ? { node } : {}),
                        data: {
                            event: 'message-start',
                            role: 'ai',
                            id: activeAssistantMessageId,
                            ...(metadata ? { metadata } : {}),
                        },
                    },
                });
            }

            if (!hasStartedAssistantBlock) {
                hasStartedAssistantBlock = true;
                emitProtocolThreadEvent(thread_uid, {
                    type: 'event',
                    event_id: `${thread_uid}:${run_id}:${++protocolSeq}`,
                    seq: protocolSeq,
                    method: 'messages',
                    params: {
                        namespace: [],
                        timestamp: Date.now(),
                        ...(node ? { node } : {}),
                        data: {
                            event: 'content-block-start',
                            index: 0,
                            content: {
                                type: 'text',
                                text: '',
                            },
                        },
                    },
                });
            }
        };

        const emitAssistantTextDelta = (text: string, node?: string, metadata?: Record<string, unknown>) => {
            if (!text) {
                return;
            }

            ensureAssistantMessageStarted(node, metadata);
            activeAssistantText += text;
            emitProtocolThreadEvent(thread_uid, {
                type: 'event',
                event_id: `${thread_uid}:${run_id}:${++protocolSeq}`,
                seq: protocolSeq,
                method: 'messages',
                params: {
                    namespace: [],
                    timestamp: Date.now(),
                    ...(node ? { node } : {}),
                    data: {
                        event: 'content-block-delta',
                        index: 0,
                        delta: {
                            type: 'text-delta',
                            text,
                        },
                    },
                },
            });
        };

        const finishAssistantMessage = (node?: string) => {
            if (!activeAssistantMessageId || !hasStartedAssistantBlock) {
                return;
            }

            emitProtocolThreadEvent(thread_uid, {
                type: 'event',
                event_id: `${thread_uid}:${run_id}:${++protocolSeq}`,
                seq: protocolSeq,
                method: 'messages',
                params: {
                    namespace: [],
                    timestamp: Date.now(),
                    ...(node ? { node } : {}),
                    data: {
                        event: 'content-block-finish',
                        index: 0,
                        content: {
                            type: 'text',
                            text: activeAssistantText,
                        },
                    },
                },
            });

            emitProtocolThreadEvent(thread_uid, {
                type: 'event',
                event_id: `${thread_uid}:${run_id}:${++protocolSeq}`,
                seq: protocolSeq,
                method: 'messages',
                params: {
                    namespace: [],
                    timestamp: Date.now(),
                    ...(node ? { node } : {}),
                    data: {
                        event: 'message-finish',
                        reason: 'stop',
                    },
                },
            });

            activeAssistantMessageId = null;
            activeAssistantText = '';
            hasStartedAssistantBlock = false;
        };

        emitLifecycle('started');

        try {
            for await (const event of stream) {
				const eventRecord = event as unknown as Record<string, unknown>;
                const eventName = typeof eventRecord.event === 'string' ? eventRecord.event : '';
                const eventData =
                    eventRecord.data && typeof eventRecord.data === 'object'
                        ? (eventRecord.data as Record<string, unknown>)
                        : {};
                const node = typeof eventRecord.name === 'string' ? eventRecord.name : undefined;
                const metadata =
                    typeof eventRecord.metadata === 'object' && eventRecord.metadata
                        ? (eventRecord.metadata as Record<string, unknown>)
                        : undefined;

                if (eventName === 'on_chat_model_start') {
                    ensureAssistantMessageStarted(node, metadata);
                    continue;
                }

                if (eventName === 'on_chat_model_stream') {
                    const chunk = eventData.chunk as Record<string, unknown> | undefined;
                    emitAssistantTextDelta(resolveStreamTextContent(chunk?.content), node, metadata);
                    continue;
                }

                if (eventName === 'on_chat_model_end') {
                    const finalOutput =
                        resolveStreamTextContent(eventData.output) ||
                        resolveStreamTextContent((eventData.chunk as Record<string, unknown> | undefined)?.content);

                    if (finalOutput && !activeAssistantText) {
                        emitAssistantTextDelta(finalOutput, node, metadata);
                    }

                    finishAssistantMessage(node);
                }
            }

            emitLifecycle('completed');
        } catch (error) {
            finishAssistantMessage();
            emitLifecycle('failed', error instanceof Error ? error.message : String(error));
            throw error;
        }

        return this.readThread(thread_uid);
    }


    // + ----- API Threads ----------------------------------------------------------------------------+

    public createThread(
        initialState: Partial<AgentThreadSnapshot> = {
            model: ConfigEngine.getConfigItem<string>('ai', 'ai.default_model'),
            provider: ConfigEngine.getConfigItem<AIProviderType>('ai', 'ai.default_provider'),
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
