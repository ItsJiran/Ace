import { StorageEngine } from '../storageEngine';
import { AIContextEngine } from '../aiContextEngine';
import { AIContextMemoryEngine } from '../aiContextMemoryEngine';
import { finalizeRequestProtocolState, stripHistorySummaryBlocksFromText } from './protocolLifecycle';
import type { AISession } from './types';

const CLASSIFICATIONS: string[] = ['system:dev', 'system:ai_parser'];

export function finalizeGatewaySessionResponse(input: {
    session: AISession;
    sessionId: string;
    prompt: string;
    reply_to_ram_key: string;
    response_reference: { storage_key: string; ref_uid: string };
}): { responseText: string; protocolState: ReturnType<typeof finalizeRequestProtocolState> } {
    const { session, sessionId, prompt, reply_to_ram_key, response_reference } = input;

    const responseMemory = StorageEngine.readMemory(reply_to_ram_key) as { text?: unknown } | undefined;
    const rawStreamText = typeof responseMemory?.text === 'string' ? responseMemory.text : '';

    const responseText = stripHistorySummaryBlocksFromText(rawStreamText);
    if (responseText !== rawStreamText) {
        StorageEngine.dispatchRAMAction({
            action: 'update_memory',
            memory_uid: reply_to_ram_key,
            payload: { text: responseText },
            classifications: CLASSIFICATIONS,
        });
    }

    const rawResponseMemory = StorageEngine.readMemory(reply_to_ram_key) as {
        raw_response?: unknown;
        blocks?: unknown;
        status?: unknown;
        error_message?: unknown;
    } | undefined;
    const rawResponseText = typeof rawResponseMemory?.raw_response === 'string' ? rawResponseMemory.raw_response : '';

    AIContextMemoryEngine.writeMemoryPayload(response_reference.storage_key, {
        session_id: sessionId,
        sdk: session.sdk,
        model: session.model,
        raw_response: rawResponseText,
        text: responseText,
        blocks: Array.isArray(rawResponseMemory?.blocks) ? rawResponseMemory.blocks : [],
        status: typeof rawResponseMemory?.status === 'string' ? rawResponseMemory.status : 'completed',
        error_message: typeof rawResponseMemory?.error_message === 'string' ? rawResponseMemory.error_message : undefined,
        updated_at: Date.now(),
    }, { status: 'out' });

    const protocolState = finalizeRequestProtocolState({
        session,
        prompt,
        responseText,
        rawResponse: rawResponseText,
    });

    StorageEngine.dispatchRAMAction({
        action: 'update_memory',
        memory_uid: reply_to_ram_key,
        payload: {
            protocol_validation: protocolState,
        },
        classifications: CLASSIFICATIONS,
    });

    AIContextMemoryEngine.pruneSessionMemories({ session_id: sessionId, retainPerType: 12, tags: ['history', 'raw'] });

    if (responseText.trim().length > 0) {
        AIContextEngine.ingestTurn(sessionId, {
            at: Date.now(),
            role: 'assistant',
            text: responseText,
        });
        AIContextEngine.buildContext(sessionId, prompt, { sdk: session.sdk, model: session.model });
    }

    return { responseText, protocolState };
}