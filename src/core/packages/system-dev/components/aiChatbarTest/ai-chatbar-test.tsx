/* eslint-disable react-refresh/only-export-components */

import { useRef } from 'react';
import type { AceRegistryType } from '#/schemas/registry-types';
import { useAIGateway } from '#/hooks/use-ai-gateway';
import { useAIChatSession } from '#/hooks/use-ai-chat-session';
import { SystemHeader } from './system-header';
import { ControlPanel } from './control-panel';
import { ConfigPanel } from './config-panel';
import ChatMessages from './chat-messages';
import { AISessionStatus } from '#/schemas/ai';

export const registry: AceRegistryType.Component = {
    name: 'ai_chatbar_test',
    slug: 'ai-chatbar-test',
    react_behavior: 'ai_chatbar_test',
};

export default function AIChatbarTest() {
    const bottomRef = useRef<HTMLDivElement | null>(null);

    const {
        selectedSdk,
        setSelectedSdk,
        selectedModel,
        setSelectedModel,
        modelOptions,
        ensureSelectedModel,
    } = useAIGateway();

    // Initialize the AI chat session using the custom hook, which manages 
    // session state and provides a function to send prompts.
    const aiChatSessionReturn = useAIChatSession();
    if(aiChatSessionReturn === undefined) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-zinc-950 text-zinc-200">
                <p>Loading session...</p>
            </div>
        );
    }

    // Destructure the values returned from the useAIChatSession hook
    const { session, sessionUid, sendPrompt, interruptSession } = aiChatSessionReturn;

    // Handler for sending a prompt
    const onSendPrompt = (prompt: string) => {
        const nextPrompt = prompt.trim();
        if (!nextPrompt) {
            return;
        }

        const modelToUse = ensureSelectedModel();
        sendPrompt(nextPrompt, selectedSdk, modelToUse);
    };

    // ChatMessages now scrolls to the latest turn after it is actually rendered.
    const wrappedSendPrompt = (prompt: string) => {
        onSendPrompt(prompt);
    };

    return (
        <div className="w-full h-full flex flex-col bg-zinc-950 text-zinc-200">
            <SystemHeader sessionId={sessionUid} />
            <ConfigPanel
                selectedSdk={selectedSdk}
                onSdkChange={setSelectedSdk}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                modelOptions={modelOptions}
            />

            <div className="flex-1 overflow-auto px-3 py-3 space-y-2">
                <ChatMessages sessionUid={sessionUid ?? undefined} bottomRef={bottomRef} />
            </div>

            <ControlPanel
                onSendPrompt={wrappedSendPrompt}
                onStopPrompt={interruptSession}
                session_status={session?.status || AISessionStatus.IDLE}
            />
        </div>
    );
}
