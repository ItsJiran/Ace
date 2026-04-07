import { useState } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { useAIGateway } from '#/hooks/useAIGateway';
import { useAIChatSession } from '#/hooks/useAIChatSession';
import { useChatAutoScroll } from '#/hooks/useChatAutoScroll';
import { SystemHeader } from './SystemHeader';
import { ConfigPanel } from './ConfigPanel';
import { ChatMessages } from './ChatMessages';
import { ControlPanel } from './ControlPanel';

export const registry: AceRegistryType.Component = {
    name: 'ai_chatbar_test',
    slug: 'ai-chatbar-test',
    react_behavior: 'ai_chatbar_test',
};

export default function AIChatbarTest() {
    const [memoryPrefix, setMemoryPrefix] = useState('system:dev:chatbar');
    const [prompt, setPrompt] = useState('');

    const {
        selectedSdk,
        setSelectedSdk,
        selectedModel,
        setSelectedModel,
        modelOptions,
        fetchModels,
        ensureSelectedModel,
    } = useAIGateway();

    const {
        turnMemoryUids,
        sessionId,
        activeTurnId,
        sendPrompt,
    } = useAIChatSession(memoryPrefix);

    const bottomRef = useChatAutoScroll<HTMLDivElement>([turnMemoryUids]);

    // Handler for sending a prompt
    const onSendPrompt = () => {
        const modelToUse = ensureSelectedModel();
        sendPrompt(prompt, selectedSdk, modelToUse);
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
                activeMemoryUid={activeTurnId || ''}
                onFetchModels={fetchModels}
            />

            <div className="flex-1 overflow-auto px-3 py-3 space-y-2">
                <ChatMessages turnMemoryUids={turnMemoryUids} bottomRef={bottomRef} />
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
