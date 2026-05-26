import { createMiddleware } from 'langchain';
import { AgentConfigType } from '#/shared/schemas/ai.ts';
import resolveConfiguredProviderName from '#/app-background/lib/utils/ai/resolve-configured-provider-name';
import resolveApiKey from '../../../lib/utils/ai/resolve-api-key';
import { getCachedApiKey } from '../../../lib/utils/ai/api-key-session-cache';

export default createMiddleware({
    name: 'InjectApiKey',
    wrapModelCall: async (request, handler) => {
        const runtime = request.runtime as AgentConfigType;
        const providerName = resolveConfiguredProviderName(runtime);
        const runtimeApiKey =
            typeof runtime.configurable?.apiKey === 'string' && runtime.configurable.apiKey.trim()
                ? runtime.configurable.apiKey.trim()
                : null;
        const apiKey = runtimeApiKey ?? (await resolveApiKey(providerName)) ?? getCachedApiKey(providerName);

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
