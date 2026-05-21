

import resolveConfiguredModelName from "#/app-background/lib/utils/ai/resolve-configured-model-name.ts";
import resolveConfiguredProviderName from "#/app-background/lib/utils/ai/resolve-configured-provider-name.ts";
import { AgentConfigType } from "#/shared/schemas/ai.ts";
import { createMiddleware, initChatModel } from "langchain";

/**
 * Runtime configurable model middleware. This middleware allows the agent to dynamically select
 * and initialize a chat model based on the configuration provided in the agent's runtime.
 */

export default createMiddleware({
    name: 'ConfigurableModel',
    wrapModelCall: async (request, handler) => {
        const runtime = request.runtime as AgentConfigType; 
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