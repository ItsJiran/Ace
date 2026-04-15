import { AIParserProtocolState, type AISession } from '#/schemas/ai';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ParserBlockArgs, ParserBlockHandler } from '#/schemas/parser';
import { KernelEngine } from '#/services/kernelEngine';

export const handlerStart: ParserBlockHandler = async ({ dispatchParserResponse }: ParserBlockArgs) => {
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};

export const handlerChunk: ParserBlockHandler = async ({ dispatchParserResponse }: ParserBlockArgs) => {
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};

export const registry: AceRegistryType.Parser = {
    name: 'context',
    slug: 'context',
    description: 'Session context management block — update summary, retrieve a stored memory, or store new information.',
    block_schema: {
        is_default_detail: true,
        purpose: 'Manage persistent session context memory. Update the session summary, retrieve a stored memory by key, or store new information for future retrieval.',
        requiredFields: '"action" (update | retrieve | store). For update: one of "summary","context_summary","type":"summary_update". For retrieve: "memory_key". For store: "title","summary","payload".',
        optionalFields: '"result_memory_uid" (key to store retrieval result), "type", "text", "kind"',
        triggerConditions: [
            'AI accumulates conversational context that should be stored for session continuity',
            'AI needs to update the session summary after significant interactions',
            'AI retrieves previously stored context information to maintain conversation state',
            'AI saves important project/user details for later reference within the session',
            'Session context needs to be refreshed or modified based on user updates',
        ],
        promptExamples: [
            'Remember that we\'re working on the authentication module',
            'Update my context with the new requirements',
            'What have we discussed so far about the database schema?',
            'Store this configuration for the next session',
            'Retrieve the project goals we defined earlier',
            'Keep track of the user preferences I just learned',
        ],
        exampleLines: [
            '  @@ace:start context',
            '  {"action":"update","type":"summary_update","text":"User bernama Gilang, sedang mengerjakan proyek React."}',
            '  @@ace:end',
            '',
            '  @@ace:start context',
            '  {"action":"retrieve","memory_key":"system:ai_context_rag:payload:some-uid","result_memory_uid":"system:session:abc:ctx_result:1"}',
            '  @@ace:end',
            '',
            '  @@ace:start context',
            '  {"action":"store","title":"Project Details","summary":"User is building React app","payload":{"stack":["Vite","TypeScript","Tauri"]}}',
            '  @@ace:end',
        ],
    },
};

export const handlerComplete: ParserBlockHandler = async ({ block, dispatchParserResponse }: ParserBlockArgs) => {
    try {
        const payload = JSON.parse(block.payload.content);
        const action = payload.action;
        const session_uid = block.session_uid;

        const sessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
        if (!sessionState) {
            dispatchParserResponse(AIParserProtocolState.ERROR);
            return;
        }

        const currentTurnIndex = sessionState.turns.length > 0 ? sessionState.turns.length - 1 : 0;
        const newContext = [...(sessionState.context || [])];

        if (action === 'store' || action === 'update') {
            newContext.push({
                at: Date.now(),
                title: payload.title || payload.type || 'Context Update',
                summary: payload.summary || payload.text,
                status: 'active',
                lifecycle_turn: currentTurnIndex,
                payload: payload.payload
            });
            console.log(`[ContextBlock] Added context entry for session ${session_uid}`);
        } else if (action === 'retrieve') {
            console.log(`[ContextBlock] Retrieval requested for ${payload.memory_key}`);
            // Logic for retrieval implementation can be expanded here depending on how RAG/memory stores are structured.
        }

        KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
            context: newContext,
        } as Partial<AISession>);

        dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
    } catch (e) {
        console.error(`[ContextBlock] Error processing block:`, e);
        dispatchParserResponse(AIParserProtocolState.ERROR);
    }
};
