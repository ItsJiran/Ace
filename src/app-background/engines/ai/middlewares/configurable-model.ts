
import resolveConfiguredModelName from "#/app-background/lib/utils/ai/resolve-configured-model-name.ts";
import resolveConfiguredProviderName from "#/app-background/lib/utils/ai/resolve-configured-provider-name.ts";
import resolveApiKey from "#/app-background/lib/utils/ai/resolve-api-key.ts";
import { getCachedApiKey } from "#/app-background/lib/utils/ai/api-key-session-cache.ts";
import { AgentConfigType, AgentModelModes, type AgentModelModeType } from "#/shared/schemas/ai.ts";
import { createMiddleware, initChatModel } from "langchain";

/**
 * Runtime configurable model middleware. This middleware allows the agent to dynamically select
 * and initialize a chat model based on the configuration provided in the agent's runtime.
 */

export default function createConfigurableModelMiddleware(
    mode: AgentModelModeType = AgentModelModes.SELECTED,
) {
    return createMiddleware({
        name: `ConfigurableModel:${mode}`,
        wrapModelCall: async (request, handler) => {
            const runtime = request.runtime as AgentConfigType;
            const providerName = resolveConfiguredProviderName(runtime);
            const resolvedMode = runtime.configurable?.model_mode ?? mode;
            const modelName = resolveConfiguredModelName(runtime, providerName, resolvedMode);
            const runtimeApiKey =
                typeof runtime.configurable?.apiKey === 'string' && runtime.configurable.apiKey.trim()
                    ? runtime.configurable.apiKey.trim()
                    : undefined;
            const apiKey = runtimeApiKey ?? (await resolveApiKey(providerName)) ?? getCachedApiKey(providerName) ?? undefined;
            const model = await initChatModel(
                `${providerName}:${modelName}`,
                apiKey ? { apiKey } : undefined,
            );
            return handler({ ...request, model });
        },
    });
}