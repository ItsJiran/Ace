import { createMiddleware } from 'langchain';
import { AgentConfigType } from '#/shared/schemas/ai.ts';
import resolveConfiguredProviderName from '#/app-background/lib/utils/ai/resolve-configured-provider-name';
import resolveApiKey from '../../../lib/utils/ai/resolve-api-key';

export default createMiddleware({
    name: 'InjectApiKey',
    wrapModelCall: async (request, handler) => {
        const runtime = request.runtime as AgentConfigType;
        const providerName = resolveConfiguredProviderName(runtime);
        const apiKey = runtime.configurable?.apiKey ?? (await resolveApiKey(providerName));

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
