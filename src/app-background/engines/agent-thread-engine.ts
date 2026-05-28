import { HumanMessage } from '@langchain/core/messages';
import { AIProviderEnvKeys, AIProviders } from '#/shared/constants/ai.ts';

import type {
    AgentConfigurableType,
    AgentInvokeContextType,
    AgentThread,
    AgentInterProcessSyncPayloadType,
    AgentThreadStateType,
    AIProviderType,
} from '#/shared/schemas/ai.ts';

import SingletonAgentInstance from './ai/agent-instance';
import { createAIStreamEventBridge } from './ai/ai-stream-events';
import resolveApiKey from '../lib/utils/ai/resolve-api-key';
import { cacheApiKey } from '../lib/utils/ai/api-key-session-cache';
import { ConfigEngine } from '#/shared/engines/config-engine';
import { Engine } from '#/shared/engines/engine';
import { EventBus } from '#/shared/engines/event-engine';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import { RPCEngine } from '#/shared/engines/rpc-engine';
import { AI_THREAD_STREAM_EVENT_SLUG } from '#/shared/schemas/ai.ts';
import { AgentStreamAnyEvent } from '#/shared/schemas/ai-stream-event';

const OPENROUTER_MODELS_ENDPOINT = 'https://openrouter.ai/api/v1/models';

class AgentThreadEngineSingleton extends Engine {
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

    // + ----- Abstract Methods ---------------------------------------------------------------+

    async boot() {}

    async setupEventRoutes() {}

    async setupRpcRoutes() {
        await RPCEngine.handle(
            'ai.fetchAvailableModels',
            async (payload: { provider?: string }) => {
                return await this.fetchAvailableModels(
                    String(payload.provider || 'openai') as never,
                );
            },
            { owner: this.constructor.name },
        );

        await RPCEngine.handle(
            'ai.syncAvailableModels',
            async (payload: { provider?: string }) => {
                return await this.syncAvailableModels(
                    String(payload.provider || 'openai') as never,
                );
            },
            { owner: this.constructor.name },
        );

        await RPCEngine.handle(
            'ai.listThreads',
            async () => {
                return this.listThreads();
            },
            { owner: this.constructor.name },
        );

        await RPCEngine.handle(
            'ai.createThread',
            async (payload: { initialState?: Record<string, unknown> }) => {
                return this.createThread((payload.initialState as Record<string, unknown>) ?? {});
            },
            { owner: this.constructor.name },
        );

        await RPCEngine.handle(
            'ai.readThread',
            async (payload: { thread_uid?: string }) => {
                return this.readThread(String(payload.thread_uid || ''));
            },
            { owner: this.constructor.name },
        );

        await RPCEngine.handle(
            'ai.syncThread',
            async (payload: { thread_uid?: string; thread?: Record<string, unknown> }) => {
                return this.syncThread(
                    String(payload.thread_uid || ''),
                    (payload.thread as Record<string, unknown>) ?? {},
                );
            },
            { owner: this.constructor.name },
        );

        await RPCEngine.handle(
            'ai.startThreadPrompt',
            async (payload: {
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
            },
            { owner: this.constructor.name },
        );

        await RPCEngine.handle(
            'ai.stopThreadPrompt',
            async (payload: { thread_uid?: string }) => {
                return await this.stopThreadPrompt(String(payload.thread_uid || ''));
            },
            { owner: this.constructor.name },
        );

        await RPCEngine.handle(
            'ai.deleteThread',
            async (payload: { thread_uid?: string }) => {
                return await this.deleteThread(String(payload.thread_uid || ''));
            },
            { owner: this.constructor.name },
        );
    }

    async setupKernelSpace() {
        KernelEngine.registerSystemMemory(
            this.ai_threads_uids_memory_uid,
            {} as Record<string, unknown>,
        );
    }

    async setupKernelTerminationHook() {}

    // + ----- API Models Provider ----------------------------------------------------------------------------+

    private async fetchProviderModelsResponse(provider: AIProviderType): Promise<unknown> {
        try {
            const response = await fetch(OPENROUTER_MODELS_ENDPOINT, {
                headers: {
                    Accept: 'application/json',
                },
            });

            if (!response.ok) {
                this.log(
                    `[AgentThreadEngine] Failed to fetch OpenRouter models for provider "${provider}".`,
                    response.status,
                    response.statusText,
                );
                return null;
            }

            return await response.json();
        } catch (error) {
            this.log(
                `[AgentThreadEngine] Failed to reach OpenRouter model registry for provider "${provider}".`,
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

    // + ----- API Events Models ----------------------------------------------------------------------------+

    /**
     * Pushes a single protocol event for a specific thread to the desktop side.
     *
     * Flow: background stream handler -> EventBus -> desktop stream consumer.
     */
    private emitProtocolThreadEvent(thread_uid: string, event: AgentStreamAnyEvent) {
        void EventBus.emit(
            AI_THREAD_STREAM_EVENT_SLUG,
            {
                payload: {
                    thread_uid,
                    event: event as AgentStreamAnyEvent,
                },
            },
            {
                target: 'desktop',
            },
        );
    }

    /**
     * Reads the in-memory index that maps thread uid -> kernel memory uid.
     *
     * Purpose: keep all thread persistence lookups anchored to a single source of truth.
     */
    private readThreadIndex(): Record<string, string> {
        return (
            (KernelEngine.readMemory(this.ai_threads_uids_memory_uid) as
                | Record<string, string>
                | undefined) ?? {}
        );
    }

    /**
     * Ensures a thread has a stable memory slot before any read/write happens.
     *
     * Flow: incoming thread action -> index validation -> thread memory uid returned.
     */
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

    /**
     * Resolves the effective runtime bootstrap state for a thread run.
     *
     * Purpose: merge prompt input, persisted thread state, config defaults, and call overrides
     * into one normalized snapshot before the stream starts.
     */
    private resolveThreadRunBootstrap(
        thread_uid: string,
        prompt: string,
        overrides: Partial<AgentConfigurableType>,
    ) {
        const normalizedPrompt = prompt.trim();
        const existingThread = this.readThread(thread_uid);
        const provider =
            overrides.provider ??
            existingThread?.provider ??
            (ConfigEngine.getConfigItem<AIProviderType>('ai', 'ai.default_provider') as
                | AIProviderType
                | undefined) ??
            AIProviders.OPENAI;
        const model =
            overrides.model ??
            existingThread?.model ??
            (ConfigEngine.getConfigItem<string>('ai', 'ai.default_model') as string | undefined);

        return {
            normalizedPrompt,
            existingThread,
            provider,
            model,
            checkpoint_id: overrides.checkpoint_id ?? existingThread?.checkpoint_id,
        };
    }

    /**
     * Builds the LangGraph runtime config passed into the agent stream call.
     *
     * Flow: resolved thread bootstrap -> runnable config -> agent invocation.
     */
    private resolveThreadRuntimeConfig(input: {
        thread_uid: string;
        model?: string;
        provider: AIProviderType;
        apiKey?: string;
        overrides: Partial<AgentConfigurableType>;
        context?: Record<string, unknown>;
        signal?: AbortSignal;
    }) {
        const { thread_uid, model, provider, apiKey, overrides, context, signal } = input;
        const sanitizedOverrides = Object.fromEntries(
            Object.entries(overrides).filter(([, value]) => value !== undefined),
        );
        const normalizedApiKey =
            typeof apiKey === 'string' && apiKey.trim() ? apiKey.trim() : undefined;

        return {
            version: 'v3' as const,
            ...(context ? { context: context as unknown as AgentInvokeContextType } : {}),
            configurable: {
                ...sanitizedOverrides,
                thread_id: thread_uid,
                model,
                provider,
                ...(normalizedApiKey ? { apiKey: normalizedApiKey } : {}),
            },
            ...(signal ? { signal } : {}),
        };
    }

    /**
     * Wraps a single thread run with lifecycle cleanup for the active run registry.
     *
     * Purpose: every started thread run must either resolve, fail, or be aborted and then
     * release its slot from `activeThreadRuns`.
     */
    private createManagedThreadRun(input: {
        thread_uid: string;
        normalizedPrompt: string;
        overrides: Partial<AgentConfigurableType>;
        context?: Record<string, unknown>;
        controller: AbortController;
    }) {
        const runPromise = this.runThreadPrompt(
            input.thread_uid,
            input.normalizedPrompt,
            input.overrides,
            input.context,
            input.controller.signal,
        )
            .catch((error) => {
                this.log(`[AgentThreadEngine] thread run failed for ${input.thread_uid}:`, error);
                return this.readThread(input.thread_uid);
            })
            .finally(() => {
                const currentRun = this.activeThreadRuns.get(input.thread_uid);
                if (currentRun?.promise === runPromise) {
                    this.activeThreadRuns.delete(input.thread_uid);
                }
            });

        return runPromise;
    }

    // + ----- API Threads ----------------------------------------------------------------------------+

    /**
     * Executes one prompt against a thread and streams all agent events into the desktop
     * protocol bridge.
     *
     * Flow:
     * 1. Resolve prompt + thread runtime config.
     * 2. Persist the thread snapshot before streaming.
     * 3. Open the agent stream.
     * 4. Forward every raw stream event into the protocol event bridge.
     * 5. Finalize lifecycle state and re-read the latest thread snapshot.
     */
    private async runThreadPrompt(
        thread_uid: string,
        prompt: string,
        overrides: Partial<AgentConfigurableType> = {},
        context?: Record<string, unknown>,
        signal?: AbortSignal,
    ) {
        const { normalizedPrompt, provider, model, checkpoint_id } = this.resolveThreadRunBootstrap(
            thread_uid,
            prompt,
            overrides,
        );

        if (!normalizedPrompt) {
            return this.readThread(thread_uid);
        }

        const streamEvents = createAIStreamEventBridge({
            threadUid: thread_uid,
            emitProtocolThreadEvent: (nextThreadUid, event : AgentStreamAnyEvent) =>
                this.emitProtocolThreadEvent(nextThreadUid, event),
        });

        // Persist the latest execution identity before the stream begins so frontend sync reads a fresh snapshot.
        this.syncThread(thread_uid, {
            thread_uid,
            checkpoint_id,
            model,
            provider,
            updated_at: Date.now(),
        });

        const streamRuntimeConfig = this.resolveThreadRuntimeConfig({
            thread_uid,
            model,
            provider,
            // apiKey, apikey in future if we want to support per-run override via RPC, but for now rely on the cache to inject into the compiled workflow.
            overrides,
            context,
            signal,
        });

        try {
            await streamEvents(
                await SingletonAgentInstance.getInstance().stream(
                    { messages: [new HumanMessage(normalizedPrompt)] },
                    streamRuntimeConfig,
                ),
            );
        } catch (error) {
            this.log(`[AgentThreadEngine] stream failed for ${thread_uid}:`, error);
            return this.readThread(thread_uid);
        }

        return this.readThread(thread_uid);
    }

    /**
     * Public entrypoint used by RPC consumers to start a new prompt on a thread.
     *
     * Flow: validate input -> reject duplicate active runs -> register AbortController ->
     * create managed run promise.
     */
    public async startThreadPrompt(
        thread_uid: string,
        prompt: string,
        overrides: Partial<AgentConfigurableType> = {},
        context?: Record<string, unknown>,
    ) {
        const { normalizedPrompt } = this.resolveThreadRunBootstrap(thread_uid, prompt, overrides);
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

        // Every active run gets its own abort signal so stop requests can terminate the underlying stream.
        const controller = new AbortController();
        const runPromise = this.createManagedThreadRun({
            thread_uid,
            normalizedPrompt,
            overrides,
            context,
            controller,
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

    /**
     * Stops the currently running stream for a thread if one exists.
     *
     * Purpose: provide an explicit abort path that waits for the managed run cleanup to finish.
     */
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

    /**
     * Creates a new persisted thread shell and returns the runtime config fragment used by callers.
     *
     * Purpose: separate thread creation from prompt execution so consumers can prepare a thread first.
     */
    public createThread(
        initialState: Partial<AgentThread> = {
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

    /**
     * Upserts the persisted thread snapshot in kernel memory.
     *
     * Flow: resolve memory slot -> merge payload with existing snapshot -> write/register memory.
     */
    public syncThread(thread_uid: string, payload: AgentInterProcessSyncPayloadType = {}): string {
        const memory_uid = this.ensureThreadIndex(thread_uid);
        const existingThread = KernelEngine.readMemory(memory_uid) as AgentThread | undefined;
        const now = Date.now();

        const existingState = existingThread?.state ?? ({ messages: [] } as AgentThreadStateType);
        const nextState: AgentThreadStateType = {
            ...existingState,
            ...(payload.state ?? {}),
            messages: Array.isArray(payload.state?.messages)
                ? payload.state.messages
                : Array.isArray(existingState.messages)
                  ? existingState.messages
                  : [],
        };

        const nextThread: AgentThread = {
            thread_uid,
            checkpoint_id: payload.checkpoint_id ?? existingThread?.checkpoint_id,
            model: payload.model ?? existingThread?.model,
            provider: payload.provider ?? existingThread?.provider,
            state: nextState,
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

    /**
     * Lists every registered thread together with its resolved kernel memory payload.
     *
     * Purpose: give the desktop side one snapshot of both the thread index and hydrated thread records.
     */
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

    /**
     * Reads one thread snapshot from kernel memory.
     *
     * Purpose: allow consumers to hydrate a thread directly even if the index was not populated in RAM yet.
     */
    public readThread(thread_uid: string): AgentThread | null {
        const memory_uid =
            this.readThreadIndex()[thread_uid] ?? this.ai_threads_memory_uid(thread_uid);

        return (KernelEngine.readMemory(memory_uid) as AgentThread | undefined) ?? null;
    }

    /**
     * Deletes a thread from both the kernel memory store and the thread index.
     *
     * Flow: resolve memory uid -> remove thread memory -> remove index entry -> report success.
     */
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

export const AgentThreadEngine = new AgentThreadEngineSingleton();
