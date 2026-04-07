import { useState, useEffect } from 'react';
import { useAceEvent } from '#/hooks/useAceEvent';
import { useAceMemory } from '#/hooks/useAceMemory';
import { AISession } from '#/services/aiGatewayEngine';
import type { SDKProvider } from '#/core/packages/system-dev/components/aiChatbarTest/types';

interface AIChatSession {
    turnMemoryUids: string[];
    sessionId: string | null;
    activeTurnId: string | null;
    sendPrompt: (prompt: string, selectedSdk: SDKProvider, selectedModel: string) => Promise<void>;
    setSessionId: React.Dispatch<React.SetStateAction<string | null>>;
}

interface AIChatSessionState {
    turn_memory_uids: string[];
}



export function useAIChatSession(memoryPrefix: string): AIChatSession {

    // Event emitter for sending prompts to the gateway
    const { emit: emitSendGateway } = useAceEvent('send_gateway');

    // Local state for session and turn tracking
    const [sessionId, setSessionId] = useState<string | null>(null);
    const sessionState = useAceMemory<AIChatSessionState>(masterStateKey);

    // Create session_uid for the first time in forever
    useEffect(() => {
        if (!sessionState) {
            const newSessionId = `session_${Date.now()}`;
            setSessionId(newSessionId);
        }
    }, [sessionState]);

    const masterStateKey = sessionId ? `system:ai_session:${sessionId}:state` : '';

    const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
    const activeTurnMemory = useAceMemory<{ status?: string }>(activeTurnId || '');
    
    // Effect to monitor active turn status and reset activeTurnId when turn completes or errors
    useEffect(() => {
        if (!activeTurnId || !activeTurnMemory?.status) return;
        const status = activeTurnMemory.status;
        if (status === 'completed' || status === 'error' || status === 'interrupted') {
            setActiveTurnId(null);
        }
    }, [activeTurnId, activeTurnMemory?.status]);

    // Function to send a prompt to the gateway, creating a new session if needed
    const sendPrompt = async (prompt: string, selectedSdk: SDKProvider, selectedModel: string) => {
        const normalizedPrompt = prompt.trim();
        if (!normalizedPrompt) return;

        const turnMemoryUid = `${memoryPrefix}:turn:${Date.now()}`;

        let sid = sessionId;
        if (!sid) {
            sid = await window.ACE.ai_gateway.createSession(selectedSdk, selectedModel);
            setSessionId(sid);
        }

        setActiveTurnId(turnMemoryUid);

        emitSendGateway(
            { prompt: normalizedPrompt },
            {
                preallocated_memory: {
                    reply_to_ram_key: turnMemoryUid,
                    session_id: sid,
                    sdk: selectedSdk,
                    model: selectedModel,
                },
            },
        );
    };

    const turnMemoryUids = Array.isArray(sessionState?.turn_memory_uids) ? sessionState.turn_memory_uids : [];

    return {
        turnMemoryUids,
        sessionId,
        activeTurnId,
        sendPrompt,
        setSessionId,
    };
}
