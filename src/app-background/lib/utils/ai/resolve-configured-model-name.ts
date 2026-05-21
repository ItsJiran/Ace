import { AIProviders } from '#/shared/constants/ai';
import { ConfigEngine } from '#/shared/engines/config-engine.ts';
import { AgentConfigType, AIProviderType } from '#/shared/schemas/ai.ts'

/**
 * Resolves the configured model name based on the runtime configuration and provider.
 * @param runtime - The agent's runtime configuration.
 * @param providerName - The name of the AI provider.
 * @returns The resolved model name.
 */
    
export default (runtime: AgentConfigType, providerName: AIProviderType) => {
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
};
