import { AIProviderEnvKeys } from "#/constants/ai.ts";
import readProcessEnv from "#/lib/read-process-env.ts";
import { AIProviderEnvKeyType, AIProviderType } from "#/schemas/ai.ts";

export default async function resolveApiKey(providerName: AIProviderType) {
       const envKeys : AIProviderEnvKeyType[] = AIProviderEnvKeys[providerName] ?? [];

    for (const envKey of envKeys) {
        const value = await readProcessEnv(envKey);
        if (value) {
            return value;
        }
    }

    return null;
}