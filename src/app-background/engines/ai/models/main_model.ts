import { initChatModel } from 'langchain';
import type { z } from 'zod';
import { AgentConfigType, type AIProviderType } from '#/shared/schemas/ai.ts';
import resolveApiKey from '#/app-background/lib/utils/ai/resolve-api-key';
import { ConfigEngine } from '#/shared/engines/config-engine';

interface MainModelOptions {
    /** AI provider (e.g. 'openai', 'anthropic'). Resolved from config if not given. */
    provider?: AIProviderType;
    /** Optional model override. Falls back to provider default if omitted. */
    model?: string;
    /** Optional API key override. Resolved from env / cache if not given. */
    apiKey?: string;
    /** Optional runtime config for provider resolution. */
    runtime?: AgentConfigType;
    tools?: any;
}

interface MainModelWithStructuredOutputOptions extends MainModelOptions {
    /** Zod schema for structured output. */
    structuredOutput: z.ZodType<any>;
    tools?: any;
}

interface MainModelWithToolsOptions extends MainModelOptions {
    structuredOutput?: any;
    /** Tools to bind to the model. */
    tools: Array<{ type: string; [key: string]: unknown }>;
}

interface MainModelPlainOptions extends MainModelOptions {
    structuredOutput?: any;
    tools?: any;
}

/**
 * Creates an `initChatModel` instance with proper provider + apiKey resolution,
 * and optionally applies `.withStructuredOutput()` or `.bindTools()`.
 *
 * @example
 * // Plain
 * const model = await mainModel({ provider: 'openai' });
 *
 * // With structured output
 * const model = await mainModel({ provider: 'openai', structuredOutput: MovieSchema });
 *
 * // With tools
 * const model = await mainModel({ provider: 'openai', tools: [{ type: 'web_search' }] });
 */
export default async function mainModel(
    options:
        | MainModelWithStructuredOutputOptions
        | MainModelWithToolsOptions
        | MainModelPlainOptions,
) {
    console.log('[mainModel] Initializing model with options:', options);

    const provider = (options.runtime?.configurable?.provider as string | undefined) ?? 'openai';

    const modelName = options.model ?? options.runtime?.configurable?.model;

    const resolvedApiKey = options.apiKey ?? (await resolveApiKey(provider as AIProviderType));

    // Build model identifier: "provider:model" or just "provider"
    const modelIdentifier = modelName ? `${provider}:${modelName}` : provider;

    console.log(`[mainModel] Resolved model identifier: ${modelIdentifier}`);

    // Resolve gateway URL from config (e.g. DeepSeek, Ollama, OpenRouter)
    const providers = ConfigEngine.getConfigItem<Record<string, { gateway?: string }>>('ai', 'ai.providers');
    const gateway = providers?.[provider]?.gateway || undefined;

    if (gateway) {
        console.log(`[mainModel] Using custom gateway for ${provider}: ${gateway}`);
    }

    const baseModel = await initChatModel(modelIdentifier, {
        ...(resolvedApiKey ? { apiKey: resolvedApiKey } : {}),
        ...(gateway ? { configuration: { baseURL: gateway } } : {}),
    });

    if (options?.tools)
        baseModel.bindTools(options.tools, { tool_choice: 'auto' });

    // if (options?.structuredOutput) {
    //     return baseModel.withStructuredOutput(options.structuredOutput);
    // }

    return baseModel;
}
