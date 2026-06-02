import { initChatModel } from 'langchain';
import type { z } from 'zod';
import { AgentConfigType, type AIProviderType } from '#/shared/schemas/ai.ts';
import resolveConfiguredProviderName from '#/app-background/lib/utils/ai/resolve-configured-provider-name';
import resolveApiKey from '../../lib/utils/ai/resolve-api-key';
import { getCachedApiKey } from '../../lib/utils/ai/api-key-session-cache';

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
    const provider =
        options.provider ??
        (options.runtime ? resolveConfiguredProviderName(options.runtime) : undefined) ??
        'openai';

    const modelName = options.model;

    const resolvedApiKey =
        options.apiKey ??
        (await resolveApiKey(provider as AIProviderType)) ??
        getCachedApiKey(provider);

    // Build model identifier: "provider:model" or just "provider"
    const modelIdentifier = modelName ? `${provider}:${modelName}` : provider;

    const baseModel = await initChatModel(modelIdentifier, {
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
