import { useEffect, useMemo, useRef, useState } from 'react';
import { useAceMemory } from '#/hooks/useAceMemory';
import type { GatewayConfig, SDKProvider } from '#/core/packages/system-dev/components/aiChatbarTest/types';

export function useAIGateway() {
    const gatewayConfig = useAceMemory<GatewayConfig>(window.ACE.ai_gateway.memory_uid);

    const [selectedProvider, setSelectedProvider] = useState<SDKProvider>('openai');
    const [selectedModel, setSelectedModel] = useState<string>('');

    const configInitialised = useRef(false);
    
    useEffect(() => {
        if (configInitialised.current || !gatewayConfig) return;
        configInitialised.current = true;
        if (gatewayConfig.active_provider ?? gatewayConfig.active_sdk) {
            setSelectedProvider((gatewayConfig.active_provider ?? gatewayConfig.active_sdk) as SDKProvider);
        }
        if (gatewayConfig.active_model) setSelectedModel(gatewayConfig.active_model);
    }, [gatewayConfig]);

    const modelOptions = useMemo(() => {
        const models = gatewayConfig?.providers?.[selectedProvider]?.models
            ?? gatewayConfig?.sdks?.[selectedProvider]?.models
            ?? [];
        return models;
    }, [gatewayConfig, selectedProvider]);

    const ensureSelectedModel = () => {
        if (selectedModel) return selectedModel;
        if (modelOptions.length > 0) {
            return modelOptions[0].id;
        }
        return gatewayConfig?.active_model || 'gpt-4o-mini';
    };

    const fetchModels = async () => {
        await window.ACE.ai_gateway.fetchModels(selectedProvider);
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
