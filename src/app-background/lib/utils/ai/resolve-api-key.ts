import { AIProviderEnvKeys } from "#/shared/constants/ai.ts";
import readProcessEnv from "#/shared/lib/read-process-env.ts";
import { AIProviderEnvKeyType, AIProviderType } from "#/shared/schemas/ai.ts";

export default async function resolveApiKey(providerName: AIProviderType) {
       const envKeys : AIProviderEnvKeyType[] = AIProviderEnvKeys[providerName] ?? [];

    for (const envKey of envKeys) {
        const value = await readProcessEnv(envKey);
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }

    return null;
}