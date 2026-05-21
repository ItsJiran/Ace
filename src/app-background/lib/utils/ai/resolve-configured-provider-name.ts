import { AIProviderType, AgentConfigType } from '#/shared/schemas/ai';
import { ConfigEngine } from '#/shared/engines/config-engine';
import { AIProviders } from '#/shared/constants/ai.ts';

/**
 * This utility function resolves the configured AI provider name based on the agent's runtime configuration.
 * It checks the following sources in order of precedence:
 * 1. The provider specified in the agent's runtime configuration (`runtime.configurable.provider`).
 * 2. The default provider specified in the global configuration (`ConfigEngine.getConfigItem('ai', 'ai.default_provider')`).
 * 3. If neither of the above is set, it defaults to `AIProviders.OPENAI`.
 *
 * @param runtime - The agent's runtime configuration which may contain a configurable provider.
 * @returns The resolved AI provider name to be used for initializing the chat model.
 * @throws Will throw an error if the resolved provider name is not a valid `AIProviderType`.
 */

export default (runtime: AgentConfigType): AIProviderType => {
    return (
        runtime.configurable?.provider ??
        (ConfigEngine.getConfigItem<AIProviderType>('ai', 'ai.default_provider') as AIProviderType | undefined) ??
        AIProviders.OPENAI
    );
}