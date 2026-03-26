import { AIContextEngine } from '../aiContextEngine';
import { AIContextRagEngine } from '../aiContextRagEngine';
import {
    HISTORY_SUMMARY_PARAGRAPH_THRESHOLD,
    countParagraphs,
    initializeRequestProtocolState,
} from './protocolLifecycle';
import type { AISession } from './types';

export interface PreparedGatewayRequest {
    composed_prompt: string;
    used_contexts: unknown[];
    prompt_reference: { ref_uid: string; storage_key: string };
    response_reference: { ref_uid: string; storage_key: string };
}

export function prepareGatewaySessionRequest(input: {
    session: AISession;
    sessionId: string;
    prompt: string;
}): PreparedGatewayRequest {
    const { session, sessionId, prompt } = input;

    AIContextEngine.attachSession(sessionId);

    const promptReference = AIContextRagEngine.reserveReference({
        type: 'prompt',
        title: 'Raw user prompt history',
        summary: 'Raw prompt for compact history reconstruction.',
        source_session: sessionId,
        tags: ['history', 'prompt', 'raw'],
        payload: {
            session_id: sessionId,
            sdk: session.sdk,
            model: session.model,
            original_prompt: prompt,
            status: 'reserved',
            created_at: Date.now(),
        },
    });

    const responseReference = AIContextRagEngine.reserveReference({
        type: 'response',
        title: 'Raw assistant response history',
        summary: 'Raw response stream for compact history reconstruction.',
        source_session: sessionId,
        tags: ['history', 'response', 'raw'],
        payload: {
            session_id: sessionId,
            sdk: session.sdk,
            model: session.model,
            raw_response: '',
            text: '',
            status: 'reserved',
            created_at: Date.now(),
        },
    });

    const promptParagraphCount = countParagraphs(prompt);
    const requirePromptSummary = promptParagraphCount >= HISTORY_SUMMARY_PARAGRAPH_THRESHOLD;

    session.currentProtocolState = initializeRequestProtocolState({
        prompt,
        promptReference,
        responseReference,
        summaryParagraphThreshold: HISTORY_SUMMARY_PARAGRAPH_THRESHOLD,
    });

    const contextBuild = AIContextEngine.buildContext(sessionId, prompt, {
        sdk: session.sdk,
        model: session.model,
        summaryParagraphThreshold: HISTORY_SUMMARY_PARAGRAPH_THRESHOLD,
        requirePromptHistorySummary: requirePromptSummary,
        requireResponseHistorySummary: false,
        promptHistoryMemoryKey: promptReference.storage_key,
        promptHistoryRefUid: promptReference.ref_uid,
        responseHistoryMemoryKey: responseReference.storage_key,
        responseHistoryRefUid: responseReference.ref_uid,
    });

    AIContextRagEngine.writeReferencePayload(promptReference.storage_key, {
        session_id: sessionId,
        sdk: session.sdk,
        model: session.model,
        original_prompt: prompt,
        composed_prompt: contextBuild.composed_prompt,
        used_contexts: contextBuild.used_contexts,
        status: 'ready',
        updated_at: Date.now(),
    });

    AIContextEngine.ingestTurn(sessionId, { at: Date.now(), role: 'user', text: prompt });

    return {
        composed_prompt: contextBuild.composed_prompt,
        used_contexts: contextBuild.used_contexts,
        prompt_reference: {
            ref_uid: promptReference.ref_uid,
            storage_key: promptReference.storage_key,
        },
        response_reference: {
            ref_uid: responseReference.ref_uid,
            storage_key: responseReference.storage_key,
        },
    };
}