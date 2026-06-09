import { useEffect, useMemo, useRef, useState } from 'react';
import { useAceMemory } from '#/app-desktop/hooks/use-ace-memory';
import { DefaultConfigAI } from '#/shared/constants/config';
import type { InferConfigData } from '#/shared/schemas/config';

type ModelOptionType = {
    id: string;
    name: string;
};

type ProviderEntry = {
    models: string[];
    model_provider_type: string;
    gateway: string;
    api_key?: string;
};

export function useAIGateway() {
    const gatewayConfig = useAceMemory<InferConfigData<typeof DefaultConfigAI>>(DefaultConfigAI.memory_uid);

    const [selectedProvider, setSelectedProvider] = useState<string>('openai');
    const [selectedModel, setSelectedModel] = useState<string>('');

    const configInitialised = useRef(false);

    // Resolve providers from new V0.0.1 structure, fall back to legacy V0.0.0
    const providers: Record<string, ProviderEntry> = useMemo(() => {
        if (!gatewayConfig) return {};

        // New V0.0.1 structure
        const newProviders = gatewayConfig['ai.providers'] as Record<string, ProviderEntry> | undefined;
        if (newProviders && Object.keys(newProviders).length > 0) {
            return newProviders;
        }

        // Legacy V0.0.0 structure — auto-convert
        const legacyProviders = gatewayConfig['ai.providers_models'] as Record<string, string[]> | undefined;
        if (legacyProviders) {
            return Object.fromEntries(
                Object.entries(legacyProviders).map(
                    ([name, models]) => [name, { models, model_provider_type: name === 'anthropic' ? 'anthropic' : name === 'google' ? 'google' : 'openai', gateway: '', api_key: '' }],
                ),
            );
        }

        return {};
    }, [gatewayConfig]);
    const providerOptions = useMemo(() => Object.keys(providers), [providers]);

    // Resolve models for selected provider, with fallbacks
    useEffect(() => {

        if (selectedProvider && providers[selectedProvider]) {
            const models = providers[selectedProvider].models;
            if (models.length > 0) {
                setSelectedModel(models[0]);
            } else {
                setSelectedModel('');
            }
        }

    }, [selectedProvider]);

    useEffect(() => {
        if (configInitialised.current || !gatewayConfig) return;
        configInitialised.current = true;
        if (gatewayConfig['ai.default_provider']) {
            setSelectedProvider(String(gatewayConfig['ai.default_provider']));
        }
        if (typeof gatewayConfig['ai.default_model'] === 'string') {
            setSelectedModel(gatewayConfig['ai.default_model']);
        }
    }, [gatewayConfig]);

    const modelOptions = useMemo<ModelOptionType[]>(() => {
        const models = providers[selectedProvider]?.models ?? [];
        return models.map((model: string) => ({
            id: model,
            name: model,
        }));
    }, [providers, selectedProvider]);

    const ensureSelectedModel = (): string => {
        if (selectedModel) return selectedModel;
        if (modelOptions.length > 0) {
            return modelOptions[0].id;
        }
        return typeof gatewayConfig?.['ai.default_model'] === 'string'
            ? gatewayConfig['ai.default_model']
            : 'gpt-4o-mini';
    };

    const fetchModels = async () => {
        await window.ACE.ai.fetchModels(selectedProvider);
    };

    return {
        selectedProvider,
        setSelectedProvider,
        selectedSdk: selectedProvider,
        setSelectedSdk: setSelectedProvider,
        selectedModel,
        setSelectedModel,
        providerOptions,
        modelOptions,
        fetchModels,
        ensureSelectedModel,
        gatewayConfig,
    };
}
