import type { ConfigFileType } from '#/shared/schemas/config';
import type { ConfigMigratorFn } from './types';

/**
 * AI Config Migrator
 *
 * Version chain:
 *   0.0.0 → 0.0.1  —  Transform flat ai.providers_models into rich ai.providers
 *                        (models + model_provider_type + gateway per provider).
 */

const migrate_0_0_0_to_0_0_1 = (config: Record<string, unknown>): Record<string, unknown> => {
    const next = { ...config };

    const legacyProviders =
        (next['ai.providers_models'] as Record<string, string[]> | undefined) ?? {};

    const providers: Record<string, { models: string[]; model_provider_type: string; gateway: string; api_key: string }> = {};

    for (const [provider, models] of Object.entries(legacyProviders)) {
        providers[provider] = {
            models: Array.isArray(models) ? models : [],
            model_provider_type: provider === 'anthropic' ? 'anthropic' : provider === 'google' ? 'google' : 'openai',
            gateway: provider === 'openai' ? 'https://api.openai.com/v1' : '',
            api_key: '',
        };
    }

    // Remove the old key, inject the new one
    delete next['ai.providers_models'];
    next['ai.providers'] = Object.keys(providers).length > 0
        ? providers
        : {
              openai: { models: ['gpt-4o', 'gpt-4o-mini'], model_provider_type: 'openai', gateway: 'https://api.openai.com/v1', api_key: '' },
          };

    return next;
};

const migrateAIConfig: ConfigMigratorFn = (raw: ConfigFileType): ConfigFileType => {
    const { version, config } = raw;

    // Already at latest — no-op
    if (version === '0.0.1') return raw;

    // 0.0.0 → 0.0.1
    if (version === '0.0.0') {
        return {
            version: '0.0.1',
            config: migrate_0_0_0_to_0_0_1(config),
        };
    }

    // Unknown version — return as-is
    return raw;
};

export default migrateAIConfig;
