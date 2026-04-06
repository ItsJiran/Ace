import { useState, useEffect } from 'react';
import { useAceEvent } from '#/hooks/useAceEvent';
import { useAceMemory } from '#/hooks/useAceMemory';
import type { SDKProvider } from '#/core/packages/system-dev/components/aiChatbarTest/types';

export function useAIChatSession(memoryPrefix: string) {
    const { emit: emitSendGateway } = useAceEvent('send_gateway');

    const [sessionId, setSessionId] = useState<string | null>(null);
    const [activeTurnId, setActiveTurnId] = useState<string | null>(null);

    // Subscribe to the overarching Daemon Session process state
    const masterStateKey = sessionId ? `system:ai_session:${sessionId}:state` : '';
    const sessionState = useAceMemory<{ turn_memory_uids: string[] }>(masterStateKey);

    // Subscribe to the active turn memory to auto-clear isLoading state
    const activeTurnMemory = useAceMemory<{ status?: string }>(activeTurnId || '');
    
    useEffect(() => {
        if (!activeTurnId || !activeTurnMemory?.status) return;
        const status = activeTurnMemory.status;
        if (status === 'completed' || status === 'error' || status === 'interrupted') {
            setActiveTurnId(null);
        }
    }, [activeTurnId, activeTurnMemory?.status]);

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
