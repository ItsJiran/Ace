import { initChatModel } from 'langchain';
import type { z } from 'zod';
import { AgentConfigType, type AIProviderType } from '#/shared/schemas/ai.ts';
import resolveApiKey from '#/app-background/lib/utils/ai/resolve-api-key';


interface MainModelOptions {
    /** AI provider (e.g. 'openai', 'anthropic'). Resolved from config if not given. */
    provider?: AIProviderType;
    /** Optional model override. Falls back to provider default if omitted. */
    model?: string;
    /** Optional API key override. Resolved from env / cache if not given. */
    apiKey?: string;
    /** Optional runtime config for provider resolution. */
    runtime?: AgentConfigType;
}

interface MainModelWithStructuredOutputOptions extends MainModelOptions {
    /** Zod schema for structured output. */
    structuredOutput: z.ZodType<any>;
    tools?: never;
}

interface MainModelWithToolsOptions extends MainModelOptions {
    structuredOutput?: never;
    /** Tools to bind to the model. */
    tools: Array<{ type: string; [key: string]: unknown }>;
}

interface MainModelPlainOptions extends MainModelOptions {
    structuredOutput?: never;
    tools?: never;
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
    options: MainModelWithStructuredOutputOptions | MainModelWithToolsOptions | MainModelPlainOptions,
) {
    console.log('[mainModel] Initializing model with options:', options);

    const provider =
        (options.runtime?.configurable?.provider as AIProviderType | undefined) ??
        'openai';

    const modelName = options.model;

    const resolvedApiKey =
        options.apiKey ??
        (await resolveApiKey(provider as AIProviderType));

    // Build model identifier: "provider:model" or just "provider"
    const modelIdentifier = modelName ? `${provider}:${modelName}` : provider;

    console.log(`[mainModel] Resolved model identifier: ${modelIdentifier}`);

    const baseModel = await initChatModel(`${options.runtime?.configurable?.provider}:${options.runtime?.configurable.model}`, {
        ...(resolvedApiKey ? { apiKey: resolvedApiKey } : {}),
    });

    if (options.structuredOutput) {
        return baseModel.withStructuredOutput(options.structuredOutput);
    }

    if (options.tools) {
        return baseModel.bindTools(options.tools);
    }

    return baseModel;
}
