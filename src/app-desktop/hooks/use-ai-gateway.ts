import { useEffect, useMemo, useRef, useState } from 'react';
import { useAceMemory } from '#/app-desktop/hooks/use-ace-memory';
import type { AIProviderType } from '#/shared/schemas/ai';
import { AIProviders } from '#/shared/constants/ai';
import { DefaultConfigAI } from '#/shared/constants/config';
import type { InferConfigData } from '#/shared/schemas/config';

type ModelOptionType = {
    id: string;
    name: string;
};

export function useAIGateway() {
    const gatewayConfig = useAceMemory<InferConfigData<typeof DefaultConfigAI>>(DefaultConfigAI.memory_uid);

    const [selectedProvider, setSelectedProvider] = useState<AIProviderType>(AIProviders.OPENAI);
    const [selectedModel, setSelectedModel] = useState<string>('');

    const configInitialised = useRef(false);

    const providerModels =
        gatewayConfig?.['ai.providers_models'] as Partial<Record<AIProviderType, string[]>> | undefined;
    
    useEffect(() => {
        if (configInitialised.current || !gatewayConfig) return;
        configInitialised.current = true;
        if (gatewayConfig['ai.default_provider']) {
            setSelectedProvider(gatewayConfig['ai.default_provider'] as AIProviderType);
        }
        if (typeof gatewayConfig['ai.default_model'] === 'string') {
            setSelectedModel(gatewayConfig['ai.default_model']);
        }
    }, [gatewayConfig]);

    const modelOptions = useMemo<ModelOptionType[]>(() => {
        const models = providerModels?.[selectedProvider] ?? [];
        return models.map((model: string) => ({
            id: model,
            name: model,
        }));
    }, [providerModels, selectedProvider]);

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
        modelOptions,
        fetchModels,
        ensureSelectedModel,
        gatewayConfig,
    };
}
