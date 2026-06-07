import { AIProviderEnvKeys } from '#/shared/constants/ai.ts';
import readProcessEnv from '#/shared/lib/read-process-env.ts';
import { ConfigEngine } from '#/shared/engines/config-engine';
import { getCachedApiKey } from './api-key-session-cache';
import type { AIProviderEnvKeyType, AIProviderType } from '#/shared/schemas/ai.ts';

/**
 * Resolve an API key for a provider with this priority chain:
 *  1. Config `ai.providers[provider].api_key`  (user-set via UI)
 *  2. Session cache                                (sub-agent fallback)
 *  3. Process environment variables                (last resort)
 */
export default async function resolveApiKey(providerName: AIProviderType): Promise<string | null> {
    // 1. Config — user-set API key via settings UI
    const providers = ConfigEngine.getConfigItem<Record<string, { api_key?: string }>>('ai', 'ai.providers');
    const configKey = providers?.[providerName]?.api_key;
    if (configKey) return configKey;

    // 2. Session cache
    const cached = getCachedApiKey(providerName);
    if (cached) return cached;

    // 3. Process env
    const envKeys: AIProviderEnvKeyType[] = AIProviderEnvKeys[providerName] ?? [];

    for (const envKey of envKeys) {
        const value = await readProcessEnv(envKey);
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }

    return null;
}