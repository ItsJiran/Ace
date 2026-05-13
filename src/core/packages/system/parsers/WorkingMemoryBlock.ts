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
    name: 'working_memory',
    slug: 'working_memory',
    description: 'Compatibility block for working-memory directives. The backend agent runtime owns working-memory policy; the frontend parser keeps this block only for stream compatibility.',
    block_schema: {
        is_default_detail: true,
        purpose: 'This block is parsed for compatibility, but working-memory writes are delegated to the backend agent runtime. The frontend no longer persists working-memory entries from streamed block payloads.',
        requiredFields: '"action" (must be "add" or "drop")',
        optionalFields: 'For "add": "uid", "description", "content". For "drop": "uid".',
        triggerConditions: [
            'When you have finished reading a file from working memory and no longer need it, use action:"drop" to free tokens.',
            'When you want to explicitly place text into working memory so you can refer to it in subsequent turns without keeping it in the main chat context.',
        ],
        promptExamples: [
            'I\'m done reading user.ts, I will drop it from working memory.',
            'Let me save this raw API response into working memory so I can analyze it in the next step.'
        ],
        exampleLines: [
            '  @@ace:start working_memory',
            '  {"action": "drop", "uid": "wm_search_result_1"}',
            '  @@ace:end',
            '',
            '  @@ace:start working_memory',
            '  {"action": "add", "uid": "wm_temp_data", "description": "Raw JSON config", "content": "{...}"}',
            '  @@ace:end',
        ],
    },
};

export const handlerComplete: ParserBlockHandler = async ({ block, dispatchParserResponse }: ParserBlockArgs) => {
    try {
        const payload = JSON.parse(block.payload.content);
        console.info('[WorkingMemoryBlock] Delegated to backend agent runtime; frontend working-memory mutations are disabled.', payload);

        dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
    } catch (e) {
        console.error(`[WorkingMemoryBlock] Error processing block:`, e);
        dispatchParserResponse(AIParserProtocolState.ERROR);
    }
};
