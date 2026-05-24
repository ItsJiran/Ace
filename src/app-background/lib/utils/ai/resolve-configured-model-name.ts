import { AIProviders } from '#/shared/constants/ai';
import { ConfigEngine } from '#/shared/engines/config-engine.ts';
import {
    AgentConfigType,
    AgentModelModes,
    type AgentModelModeType,
    AIProviderType,
} from '#/shared/schemas/ai.ts'

/**
 * Resolves the configured model name based on the runtime configuration and provider.
 * @param runtime - The agent's runtime configuration.
 * @param providerName - The name of the AI provider.
 * @returns The resolved model name.
 */
    
function resolveProviderLowCostModel(providerName: AIProviderType) {
    if (providerName === AIProviders.ANTHROPIC) {
        return 'claude-3-5-haiku-latest';
    }

    if (providerName === AIProviders.GOOGLE) {
        return 'gemini-2.0-flash';
    }

    return 'gpt-4o-mini';
}

function resolveProviderMediumModel(providerName: AIProviderType) {
    if (providerName === AIProviders.ANTHROPIC) {
        return 'claude-3-5-sonnet-latest';
    }

    if (providerName === AIProviders.GOOGLE) {
        return 'gemini-2.0-flash';
    }

    return 'gpt-4.1-mini';
}

export default (
    runtime: AgentConfigType,
    providerName: AIProviderType,
    mode: AgentModelModeType = AgentModelModes.SELECTED,
) => {
    const configuredDefaultModel = ConfigEngine.getConfigItem<string>('ai', 'ai.default_model') as
        | string
        | undefined;

    if (mode === AgentModelModes.LOW) {
        return resolveProviderLowCostModel(providerName);
    }

    if (mode === AgentModelModes.MEDIUM) {
        return resolveProviderMediumModel(providerName);
    }

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
