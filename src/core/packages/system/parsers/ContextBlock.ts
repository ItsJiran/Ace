import { AIParserProtocolState } from '#/schemas/ai';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ParserBlockArgs, ParserBlockHandler } from '#/schemas/parser';

export const handlerStart: ParserBlockHandler = async ({ dispatchParserResponse }: ParserBlockArgs) => {
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};

export const handlerChunk: ParserBlockHandler = async ({ dispatchParserResponse }: ParserBlockArgs) => {
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};

export const registry: AceRegistryType.Parser = {
    name: 'context',
    slug: 'context',
    description: 'Compatibility block for context directives. LangGraph owns durable context state; the frontend parser keeps this block only for stream compatibility.',
    block_schema: {
        is_default_detail: true,
        purpose: 'This block is parsed for compatibility, but context storage and retrieval are delegated to LangGraph. The frontend no longer persists or windows context entries from streamed block payloads.',
        requiredFields: '"action" (store | list). For store: one of "content" | "text". For list: "start_index".',
        optionalFields: 'For store: "title", "kind", "payload". For list: "end_index".',
        triggerConditions: [
            'Use context only for durable reasoning state, not for every tiny mechanical action log.',
            'AI wants to remember an intermediate result such as "hasil dari x adalah y".',
            'AI wants to note the next intended action such as "sekarang saya akan melakukan x".',
            'AI wants to capture the user request or planning state as part of a lightweight reasoning chain.',
            'AI has made a meaningful decision or learned a constraint that should survive into the next autonomous step.',
            'AI wants to focus the active context window to a specific stored range by index.',
        ],
        promptExamples: [
            'Store that the result of running migration X is success.',
            'Store that the user requested feature Y.',
            'Store the current plan before continuing to the next tool call.',
            'Store the key constraint that the user does not want database schema changes.',
            'Do not store a trivial note that only says you are about to type one command right now.',
            'List context entries from index 3 until index 8.',
        ],
        exampleLines: [
            '  @@ace:start context',
            '  {"action":"store","title":"Observed Result","content":"Hasil dari pengecekan API ternyata statusnya 200."}',
            '  @@ace:end',
            '',
            '  @@ace:start context',
            '  {"action":"store","title":"Plan","content":"Sekarang saya akan melakukan validasi payload sebelum lanjut ke langkah berikutnya."}',
            '  @@ace:end',
            '',
            '  @@ace:start context',
            '  {"action":"store","title":"Constraint","content":"User tidak ingin ada perubahan schema database."}',
            '  @@ace:end',
            '',
            '  @@ace:start context',
            '  {"action":"list","start_index":0,"end_index":5}',
            '  @@ace:end',
        ],
    },
};

export const handlerComplete: ParserBlockHandler = async ({ block, dispatchParserResponse }: ParserBlockArgs) => {
    try {
        const payload = JSON.parse(block.payload.content);
        console.info('[ContextBlock] Delegated to LangGraph; frontend context mutations are disabled.', payload);

        dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
    } catch (e) {
        console.error(`[ContextBlock] Error processing block:`, e);
        dispatchParserResponse(AIParserProtocolState.ERROR);
    }
};
