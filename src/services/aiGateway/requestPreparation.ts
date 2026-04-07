// import { AIContextEngine } from '../aiContextEngine';
// import { AIContextMemoryEngine } from '../aiContextMemoryEngine';
// import {
//     HISTORY_SUMMARY_PARAGRAPH_THRESHOLD,
// } from './protocolLifecycle';
// import { AIContextMemoryEngine } from '../aiContextMemoryEngine';

import type { AISession } from './types';

export interface PreparedGatewayRequest {
    composed_prompt: string;
    used_contexts: unknown[];
    prompt_reference: { ref_uid: string; storage_key: string };
    response_reference: { ref_uid: string; storage_key: string };
}

// To be implemented yet. The idea is to have a standardized way to prepare the 
// session context and prompt for the interaction loop. This involves 
// reserving memory for the prompt and response, building the initial context for 
// the session, and returning references that can be used in the interaction loop for
// updating the prompt and response history in memory.

export function prepareGatewaySessionRequest(input: {
    session: AISession;
    sessionId: string;
    prompt: string;
}): PreparedGatewayRequest | unknown {
    // const { session, sessionId, prompt } = input;

    // Feature that hasn't impleted yet but the idea is to have a standardized way 
    // to prepare the session context and prompt for the interaction loop this is from the 
    // legacy codebase.

    // AIContextEngine.attachSession(sessionId);
    // AIContextMemoryEngine.reserveMemory({
    //     uid: promptRefUid,
    //     memory_key: promptStorageKey,
    //     type: 'conversation_history',
    //     session_id: sessionId,
    //     title: 'Raw user prompt history',
    //     summary: 'Raw prompt for compact history reconstruction.',
    //     payload: {
    //         session_id: sessionId,
    //         sdk: session.sdk,
    //         model: session.model,
    //         original_prompt: prompt,
    //         status: 'reserved',
    //         created_at: Date.now(),
    //     },
    //     source: 'system',
    //     source_ref: 'ai_context_rag',
    //     tags: ['history', 'prompt', 'raw'],
    // });

    // AIContextMemoryEngine.reserveMemory({
    //     uid: responseRefUid,
    //     memory_key: responseStorageKey,
    //     type: 'conversation_history',
    //     session_id: sessionId,
    //     title: 'Raw assistant response history',
    //     summary: 'Raw response stream for compact history reconstruction.',
    //     payload: {
    //         session_id: sessionId,
    //         sdk: session.sdk,
    //         model: session.model,
    //         raw_response: '',
    //         text: '',
    //         status: 'reserved',
    //         created_at: Date.now(),
    //     },
    //     source: 'system',
    //     source_ref: 'ai_context_rag',
    //     tags: ['history', 'response', 'raw'],
    // });

    // const promptRefUid = `ctxref-${crypto.randomUUID()}`;
    // const promptStorageKey = `system:ai_context_rag:payload:${promptRefUid}`;
    
    // const promptReference = { ref_uid: promptRefUid, storage_key: promptStorageKey };

    // const responseRefUid = `ctxref-${crypto.randomUUID()}`;
    // const responseStorageKey = `system:ai_context_rag:payload:${responseRefUid}`;
    
    // const responseReference = { ref_uid: responseRefUid, storage_key: responseStorageKey };

    // const promptParagraphCount = countParagraphs(prompt);
    // const requirePromptSummary = promptParagraphCount >= HISTORY_SUMMARY_PARAGRAPH_THRESHOLD;

    // current protocl state actually for now not needed.
    // session.currentProtocolState = initializeRequestProtocolState({
    //     prompt,
    //     promptReference,
    //     responseReference,
    //     summaryParagraphThreshold: HISTORY_SUMMARY_PARAGRAPH_THRESHOLD,
    // });

    // const contextBuild = AIContextEngine.buildContext(sessionId, prompt, {
    //     sdk: session.sdk,
    //     model: session.model,
    //     summaryParagraphThreshold: HISTORY_SUMMARY_PARAGRAPH_THRESHOLD,
    //     requirePromptHistorySummary: requirePromptSummary,
    //     requireResponseHistorySummary: false,
    //     promptHistoryMemoryKey: promptReference.storage_key,
    //     promptHistoryRefUid: promptReference.ref_uid,
    //     responseHistoryMemoryKey: responseReference.storage_key,
    //     responseHistoryRefUid: responseReference.ref_uid,
    // });

    // AIContextMemoryEngine.writeMemoryPayload(promptReference.storage_key, {
    //     session_id: sessionId,
    //     sdk: session.sdk,
    //     model: session.model,
    //     original_prompt: prompt,
    //     composed_prompt: contextBuild.composed_prompt,
    //     used_contexts: contextBuild.used_contexts,
    //     status: 'ready',
    //     updated_at: Date.now(),
    // }, { status: 'out' });

    // AIContextEngine.ingestTurn(sessionId, { at: Date.now(), role: 'user', text: prompt });

    return {
        // composed_prompt: contextBuild.composed_prompt,
        // used_contexts: contextBuild.used_contexts,
        // prompt_reference: {
        //     ref_uid: promptReference.ref_uid,
        //     storage_key: promptReference.storage_key,
        // },
        // response_reference: {
        //     ref_uid: responseReference.ref_uid,
        //     storage_key: responseReference.storage_key,
        // },
    };
}