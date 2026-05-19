import type { AgentConfig, AIProviderType } from '#/shared/schemas/ai';
import { createCodeInterpreterMiddleware } from "@langchain/quickjs";
import { AIProviders } from '#/shared/constants/ai';
import { ConfigEngine } from '#/shared/engines/config-engine';
import { 
    initChatModel, 
    createMiddleware, 
    summarizationMiddleware, 
    llmToolSelectorMiddleware, 
    ClearToolUsesEdit, 
    contextEditingMiddleware,
} from 'langchain';
import { AIEngine } from '../ai-engine';
import resolveApiKey from './resolve-api-key';

function resolveConfiguredProviderName(runtime: AgentConfig): AIProviderType {
    return (
        runtime.configurable?.provider ??
        (ConfigEngine.getConfigItem<AIProviderType>('ai', 'ai.default_provider') as AIProviderType | undefined) ??
        AIProviders.OPENAI
    );
}

function resolveConfiguredModelName(runtime: AgentConfig, providerName: string) {
    const configuredDefaultModel = ConfigEngine.getConfigItem<string>('ai', 'ai.default_model') as
        | string
        | undefined;

    if (runtime.configurable?.model) {
        return runtime.configurable.model;
    }

    if (configuredDefaultModel) {
        return configuredDefaultModel;
    }

    if (providerName === AIProviders.ANTHROPIC) {
        return 'claude-3-5-sonnet-latest';
    }

    if (providerName === AIProviders.GOOGLE) {
        return 'gemini-2.0-flash';
    }

    return 'gpt-4o-mini';
}

/**
 * Runtime configurable model middleware. This middleware allows the agent to dynamically select
 * and initialize a chat model based on the configuration provided in the agent's runtime.
 *
 * The model name is retrieved from the runtime's configurable properties, 
 * and the corresponding
 * chat model is initialized and passed to the handler for processing the request.
 */

const configurableModel = createMiddleware({
    name: 'ConfigurableModel',
    wrapModelCall: async (request, handler) => {
        const runtime = request.runtime as AgentConfig; 
        const providerName = resolveConfiguredProviderName(runtime); 
        const modelName = resolveConfiguredModelName(runtime, providerName); 
        const apiKey = runtime.configurable?.apiKey;
        const model = await initChatModel(
            `${providerName}:${modelName}`,
            apiKey ? { apiKey } : undefined,
        );
        return handler({ ...request, model });
    },
});

/**
 * contextEditingMiddleware. This middleware allows the agent to 
 * store and retrieve intermediate tool results
 */
const contextEditingMiddlewareInstance = contextEditingMiddleware({
    edits: [
        new ClearToolUsesEdit(),
    ],
});

const injectApiKeyMiddleware = createMiddleware({
    name: 'InjectApiKey',
    wrapModelCall: async (request, handler) => {
        const runtime = request.runtime as AgentConfig; 
        const providerName = resolveConfiguredProviderName(runtime); 
        const apiKey = runtime.configurable?.apiKey ?? await resolveApiKey(providerName);

        if (!apiKey) {
            return handler(request);
        }

        return handler({
            ...request,
            runtime: {
                ...runtime,
                configurable: {
                    ...runtime.configurable,
                    apiKey,
                },
            },
        });
    },
});

const syncKernelSpaceMiddleware = createMiddleware({
    name: 'SyncKernelSpace',
    afterAgent: async (state, runtime) => {
        const agentRuntime = runtime as AgentConfig;
        const thread_id = agentRuntime.configurable?.thread_id;

        if (!thread_id) {
            return;
        }

        AIEngine.syncThread(thread_id, {
            thread_uid: thread_id,
            checkpoint_id: agentRuntime.configurable?.checkpoint_id,
            model: agentRuntime.configurable?.model,
            provider: agentRuntime.configurable?.provider,
            messages: Array.isArray((state as { messages?: unknown[] }).messages)
                ? ((state as { messages?: unknown[] }).messages ?? [])
                : [],
            state: state as Record<string, unknown>,
        });
    },
});

export default [
    injectApiKeyMiddleware,
    configurableModel, 
    syncKernelSpaceMiddleware,

    // prebuild middleware
    summarizationMiddleware, 
    llmToolSelectorMiddleware,
    contextEditingMiddlewareInstance,
    createCodeInterpreterMiddleware(), 
];
