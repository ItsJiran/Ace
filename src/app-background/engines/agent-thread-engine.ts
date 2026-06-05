import { HumanMessage } from '@langchain/core/messages';
import { AIProviders } from '#/shared/constants/ai.ts';

import type {
    AceAgentWorkflowState,
    AgentConfigurableType,
    AgentInvokeContextType,
    AIProviderType,
} from '#/shared/schemas/ai.ts';

import SingletonAgentInstance from './ai/agent-instance';
import { createAIStreamEventBridge } from './ai/agent-stream-events';
import { ConfigEngine } from '#/shared/engines/config-engine';
import { Engine } from '#/shared/engines/engine';
import { RPCEngine } from '#/shared/engines/rpc-engine';
import { AI_THREAD_STREAM_EVENT_SLUG } from '#/shared/schemas/ai.ts';
import { AgentStreamAnyEvent } from '#/shared/schemas/agent-stream-events';
import { getActiveGraphStructure } from './ai/workflows/ace_graph_v2_simple/graph_structure';

const OPENROUTER_MODELS_ENDPOINT = 'https://openrouter.ai/api/v1/models';

/**
 * Background agent-thread engine — slimmed down.
 *
 * Responsibilities:
 * - Fetch & sync available AI models.
 * - Start / stop thread prompt runs against the LangGraph workflow.
 * - Bridge raw stream events to the desktop protocol.
 * - Read raw AceAgentWorkflowState from the LangGraph checkpointer on demand.
 *
 * DOES NOT store AgentThread (that's purely client-side).
 * DOES NOT run the sync-frontend-kernel middleware (dead code removed).
 */
class AgentThreadEngineSingleton extends Engine {
    private activeThreadRuns = new Map<
        string,
        {
            controller: AbortController;
            promise: Promise<void>;
            started_at: number;
            wasInterrupted?: boolean;
        }
    >();

    /** Tracks known thread IDs so listThreads can enumerate them. */
    private knownThreadIds = new Set<string>();

    // + ----- Abstract Methods ---------------------------------------------------------------+

    async boot() {}

    async setupEventRoutes() {}

    async setupRpcRoutes() {
        // --- Model RPCs -------------------------------------------------
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

        // --- Thread run RPCs --------------------------------------------
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

        // --- Health check ---
        await RPCEngine.handle(
            'ai.isThreadRunning',
            async (payload: { thread_uid?: string }) => {
                return this.activeThreadRuns.has(String(payload.thread_uid || ''));
            },
            { owner: this.constructor.name },
        );

        // --- Raw state RPCs (return AceAgentWorkflowState, not AgentThread) ---
        await RPCEngine.handle(
            'ai.listThreads',
            async () => {
                return await this.listThreads();
            },
            { owner: this.constructor.name },
        );

        await RPCEngine.handle(
            'ai.readThread',
            async (payload: { thread_uid?: string }) => {
                return await this.readThread(String(payload.thread_uid || ''));
            },
            { owner: this.constructor.name },
        );

        await RPCEngine.handle(
            'ai.syncThread',
            async (payload: { thread_uid?: string }) => {
                return await this.syncThread(String(payload.thread_uid || ''));
            },
            { owner: this.constructor.name },
        );

        // --- Graph structure (for AgentGraphDebug) ---
        // Uses structured definition from ace_graph_v2_simple.
        await RPCEngine.handle(
            'ai.getGraph',
            async () => {
                return getActiveGraphStructure();
            },
            { owner: this.constructor.name },
        );
    }

    async setupKernelSpace() {
        // No thread index to initialise — threads live on the desktop side.
    }

    async setupKernelTerminationHook() {}

    // + ----- API Models Provider ----------------------------------------------------------------------------+

    private async fetchProviderModelsResponse(provider: AIProviderType): Promise<unknown> {
        try {
            const response = await fetch(OPENROUTER_MODELS_ENDPOINT, {
                headers: { Accept: 'application/json' },
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

        if (!candidate || typeof candidate !== 'object') return null;

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
        if (!payload || typeof payload !== 'object') return [];

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

    // + ----- Protocol Events ----------------------------------------------------------------------------+

    /**
     * Pushes a single protocol event for a specific thread to the desktop side.
     */
    private async emitProtocolThreadEvent(thread_uid: string, event: AgentStreamAnyEvent) {
        await RPCEngine.invoke(AI_THREAD_STREAM_EVENT_SLUG, {
            payload: {
                thread_uid,
                event: event as AgentStreamAnyEvent,
            },
        });
    }

    // + ----- Workflow State (from LangGraph checkpointer) --------------------------------------------+

    /**
     * Reads the raw AceAgentWorkflowState from the LangGraph checkpointer.
     */
    private async readWorkflowState(thread_uid: string): Promise<AceAgentWorkflowState | null> {
        try {
            const agent = SingletonAgentInstance.getInstance().value;
            const state = await agent.getState({ configurable: { thread_id: thread_uid } });
            if (!state || !state.values) return null;
            return state.values as AceAgentWorkflowState;
        } catch {
            return null;
        }
    }

    /**
     * Lists all known thread IDs with their raw workflow state.
     * Returns `{ thread_uid, state: AceAgentWorkflowState | null }[]`.
     */
    public async listThreads() {
        const threads: Array<{ thread_uid: string; state: AceAgentWorkflowState | null }> = [];

        for (const thread_uid of this.knownThreadIds) {
            const state = await this.readWorkflowState(thread_uid);
            threads.push({ thread_uid, state });
        }

        return { threads };
    }

    /**
     * Reads raw AceAgentWorkflowState for a single thread.
     */
    public async readThread(thread_uid: string): Promise<AceAgentWorkflowState | null> {
        if (!thread_uid) return null;
        return await this.readWorkflowState(thread_uid);
    }

    /**
     * Registers a thread_uid and returns its raw workflow state.
     * Pure pass-through — no AgentThread persistence.
     */
    public async syncThread(thread_uid: string): Promise<AceAgentWorkflowState | null> {
        if (!thread_uid) return null;
        this.knownThreadIds.add(thread_uid);
        return await this.readWorkflowState(thread_uid);
    }

    // + ----- Thread Run Bootstrap ----------------------------------------------------------------------------+

    private resolveThreadRunBootstrap(
        prompt: string,
        overrides: Partial<AgentConfigurableType>,
    ) {
        const normalizedPrompt = prompt.trim();
        const provider =
            overrides.provider ??
            (ConfigEngine.getConfigItem<AIProviderType>('ai', 'ai.default_provider') as
                | AIProviderType
                | undefined) ??
            AIProviders.OPENAI;
        const model =
            overrides.model ??
            (ConfigEngine.getConfigItem<string>('ai', 'ai.default_model') as string | undefined);

        return {
            normalizedPrompt,
            provider,
            model,
            checkpoint_id: overrides.checkpoint_id,
        };
    }

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

    // + ----- Thread Run Core ----------------------------------------------------------------------------+

    /**
     * Executes one prompt against a thread and streams all agent events into the desktop
     * protocol bridge. Does NOT persist AgentThread — the desktop client handles that.
     *
     * Emits invoke-completed or invoke-failed as the final event so the client knows
     * the prompt invocation truly finished (unlike per-node lifecycle events).
     */
    private async runThreadPrompt(
        thread_uid: string,
        prompt: string,
        overrides: Partial<AgentConfigurableType> = {},
        context?: Record<string, unknown>,
        signal?: AbortSignal,
    ): Promise<void> {
        const { normalizedPrompt, provider, model } = this.resolveThreadRunBootstrap(
            prompt,
            overrides,
        );

        if (!normalizedPrompt) return;

        const streamEvents = createAIStreamEventBridge({
            threadUid: thread_uid,
            emitProtocolThreadEvent: async (nextThreadUid, event: AgentStreamAnyEvent) =>
                await this.emitProtocolThreadEvent(nextThreadUid, event),
        });

        const streamRuntimeConfig = this.resolveThreadRuntimeConfig({
            thread_uid,
            model,
            provider,
            overrides,
            context,
            signal,
        });

        try {
            await streamEvents(
                await SingletonAgentInstance.getInstance().stream(
                    { messages: [new HumanMessage(normalizedPrompt)], original_prompt: normalizedPrompt },
                    streamRuntimeConfig,
                ),
            );

            // Check if this run was interrupted — emit accordingly.
            const activeRun = this.activeThreadRuns.get(thread_uid);
            const wasInterrupted = activeRun?.wasInterrupted === true;

            await this.emitProtocolThreadEvent(thread_uid, {
                channel: 'invoke',
                type: wasInterrupted ? 'invoke-interrupted' : 'invoke-completed',
                seq: null,
                node: null,
                data: { thread_uid },
            } as AgentStreamAnyEvent);
        } catch (error) {
            this.log(`[AgentThreadEngine] stream failed for ${thread_uid}:`, error);

            await this.emitProtocolThreadEvent(thread_uid, {
                channel: 'invoke',
                type: 'invoke-failed',
                seq: null,
                node: null,
                data: {
                    thread_uid,
                    error: error instanceof Error ? error.message : String(error),
                },
            } as AgentStreamAnyEvent);
        }
    }

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
            })
            .finally(() => {
                const currentRun = this.activeThreadRuns.get(input.thread_uid);
                if (currentRun?.promise === runPromise) {
                    this.activeThreadRuns.delete(input.thread_uid);
                }
            });

        return runPromise;
    }

    // + ----- Public Entrypoints ----------------------------------------------------------------------------+

    public async startThreadPrompt(
        thread_uid: string,
        prompt: string,
        overrides: Partial<AgentConfigurableType> = {},
        context?: Record<string, unknown>,
    ) {
        const { normalizedPrompt } = this.resolveThreadRunBootstrap(prompt, overrides);
        if (!thread_uid || !normalizedPrompt) {
            return { ok: false, started: false, thread_uid };
        }

        // Track this thread so listThreads can enumerate it.
        this.knownThreadIds.add(thread_uid);

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

    public async stopThreadPrompt(thread_uid: string) {
        const activeRun = this.activeThreadRuns.get(thread_uid);
        if (!activeRun) return false;

        // Inject is_interrupted flag into root state so running nodes
        // (and the supervision edge liveness check) detect the interruption
        // and exit gracefully via __end__.
        try {
            await SingletonAgentInstance.getInstance().updateState(
                { configurable: { thread_id: thread_uid } },
                { is_stopped: true },
            );
            activeRun.wasInterrupted = true;
        } catch {
            // updateState may fail if graph isn't running — that's fine.
        }

        // Let the graph finish on its own — supervision edge will detect
        // is_interrupted and route to __end__ cleanly.
        await activeRun.promise;
        return true;
    }
}

export const AgentThreadEngine = new AgentThreadEngineSingleton();
