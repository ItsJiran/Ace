import { useEffect, useMemo, useRef, useState } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { useAceMemory } from '#/hooks/useAceMemory';
import type { ChatMessage, GatewayConfig, ParserBatchMemory, SDKProvider } from './types';
import { SystemHeader } from './SystemHeader';
import { ConfigPanel } from './ConfigPanel';
import { BlockHandlerState } from './BlockHandlerState';
import { ChatMessages } from './ChatMessages';
import { ControlPanel } from './ControlPanel';

export const registry: AceRegistryType.Component = {
    name: 'ai_chatbar_test',
    slug: 'ai-chatbar-test',
    react_behavior: 'ai_chatbar_test',
};

const IDLE_MEMORY_KEY = 'system:dev:chatbar:idle';

export default function AIChatbarTest() {
    const gatewayConfig = useAceMemory<GatewayConfig>(window.ACE.ai_gateway.memory_uid);

    const [memoryPrefix, setMemoryPrefix] = useState('system:dev:chatbar');
    const [activeMemoryUid, setActiveMemoryUid] = useState(IDLE_MEMORY_KEY);
    const [prompt, setPrompt] = useState('');
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);

    const [selectedSdk, setSelectedSdk] = useState<SDKProvider>('openai');
    const [selectedModel, setSelectedModel] = useState<string>('');

    // Sync SDK/model from RAM config on first load (only if not already customised by user)
    const configInitialised = useRef(false);
    useEffect(() => {
        if (configInitialised.current || !gatewayConfig) return;
        configInitialised.current = true;
        if (gatewayConfig.active_sdk) setSelectedSdk(gatewayConfig.active_sdk);
        if (gatewayConfig.active_model) setSelectedModel(gatewayConfig.active_model);
    }, [gatewayConfig]);

    const responseMemory = useAceMemory<ParserBatchMemory>(activeMemoryUid);
    const bottomRef = useRef<HTMLDivElement | null>(null);

    const modelOptions = useMemo(() => {
        const models = gatewayConfig?.sdks?.[selectedSdk]?.models ?? [];
        return models;
    }, [gatewayConfig, selectedSdk]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, [messages]);

    useEffect(() => {
        if (!activeTurnId || !responseMemory) return;

        setMessages((prev) => prev.map((msg) => {
            if (msg.turnId !== activeTurnId || msg.role !== 'assistant') return msg;
            return {
                ...msg,
                content: responseMemory.text || '',
                status: responseMemory.status,
                parserBatchCount: responseMemory.parser_batch_count,
                eventsTotal: responseMemory.events_total,
            };
        }));

        if (responseMemory.status === 'completed' || responseMemory.status === 'error') {
            setActiveTurnId(null);
            setActiveMemoryUid(IDLE_MEMORY_KEY);
        }
    }, [responseMemory, activeTurnId]);

    const ensureSelectedModel = () => {
        if (selectedModel) return selectedModel;
        if (modelOptions.length > 0) {
            return modelOptions[0].id;
        }
        return gatewayConfig?.active_model || 'gpt-4o-mini';
    };

    const onFetchModels = async () => {
        await window.ACE.ai_gateway.fetchModels(selectedSdk);
    };

    const onSendPrompt = async () => {
        const normalizedPrompt = prompt.trim();
        if (!normalizedPrompt || activeTurnId) return;

        const modelToUse = ensureSelectedModel();
        const turnId = crypto.randomUUID();
        const turnMemoryUid = `${memoryPrefix}:turn:${Date.now()}`;

        let sid = sessionId;
        if (!sid) {
            sid = await window.ACE.ai_gateway.createSession(selectedSdk, modelToUse);
            setSessionId(sid);
        }

        setMessages((prev) => [
            ...prev,
            {
                id: `user-${turnId}`,
                role: 'user',
                content: normalizedPrompt,
                turnId,
            },
            {
                id: `assistant-${turnId}`,
                role: 'assistant',
                content: '',
                turnId,
                status: 'streaming',
                parserBatchCount: 0,
                eventsTotal: 0,
            },
        ]);

        setActiveTurnId(turnId);
        setActiveMemoryUid(turnMemoryUid);

        window.ACE.event.emit({
            event_type: 'interaction',
            action: 'send_gateway',
            payload: {
                prompt: normalizedPrompt,
            },
            preallocated_memory: {
                reply_to_ram_key: turnMemoryUid,
                session_id: sid,
                sdk: selectedSdk,
                model: modelToUse,
            },
        } as any);

        setPrompt('');
    };

    return (
        <div className="w-full h-full flex flex-col bg-zinc-950 text-zinc-200">
            <SystemHeader sessionId={sessionId} />
            <ConfigPanel
                selectedSdk={selectedSdk}
                onSdkChange={setSelectedSdk}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                modelOptions={modelOptions}
                memoryPrefix={memoryPrefix}
                onMemoryPrefixChange={setMemoryPrefix}
                activeMemoryUid={activeMemoryUid}
                onFetchModels={onFetchModels}
            />

            <div className="flex-1 overflow-auto px-3 py-3 space-y-2">
                <BlockHandlerState responseMemory={responseMemory} />

                <ChatMessages messages={messages} responseMemory={responseMemory} bottomRef={bottomRef} />
            </div>

            <ControlPanel
                prompt={prompt}
                onPromptChange={setPrompt}
                onSendPrompt={onSendPrompt}
                isLoading={Boolean(activeTurnId)}
            />
        </div>
    );
}
