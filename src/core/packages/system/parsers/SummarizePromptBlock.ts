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
    name: 'summarize_prompt',
    slug: 'summarize_prompt',
    description: 'Compatibility block for prompt-summary directives. The backend agent runtime owns prompt summarization; the frontend parser keeps this block only for stream compatibility.',
    block_schema: {
        is_default_detail: true,
        purpose: 'This block is parsed for compatibility, but prompt summarization is delegated to the backend agent runtime. The frontend no longer writes prompt summaries into local session history.',
        requiredFields: '"action" (store) and "content".',
        optionalFields: '"turn_index" (defaults to current turn) and "payload".',
        triggerConditions: [
            'When the original user prompt is too large and should be compressed into a short durable summary.',
            'When future turns need to remember the meaning of a long user request without replaying the full raw prompt.',
            'When you want to preserve the user request semantically before the turn history becomes noisy or expensive.',
        ],
        promptExamples: [
            'Store a short summary of this user prompt for turn history.',
            'Compress the user request into a durable prompt summary before the turn gets too large.',
            'Summarize the current user request so future turns can remember it efficiently.',
        ],
        exampleLines: [
            '  @@ace:start summarize_prompt',
            '  {"action":"store","content":"User meminta audit parser streaming dan migrasi delimiter block ke @@ace:start/@@ace:end."}',
            '  @@ace:end',
        ],
    },
};

export const handlerComplete: ParserBlockHandler = async ({ block, dispatchParserResponse }: ParserBlockArgs) => {
    try {
        const payload = JSON.parse(block.payload.content);
        console.info('[SummarizePromptBlock] Delegated to backend agent runtime; frontend prompt-summary mutations are disabled.', payload);

        dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
    } catch (e) {
        console.error(`[SummarizePromptBlock] Error processing block:`, e);
        dispatchParserResponse(AIParserProtocolState.ERROR);
    }
};