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
    name: 'planning',
    slug: 'planning',
    description: 'Compatibility block for planning directives. The backend agent runtime owns execution planning; the frontend parser keeps this block only for stream compatibility.',
    block_schema: {
        is_default_detail: true,
        purpose: 'This block is parsed for compatibility, but planning state is delegated to the backend agent runtime. The frontend no longer persists or mutates per-cycle plans from streamed block payloads.',
        requiredFields: '"action" (set | complete | reset).',
        optionalFields: '"target_state". Required for reasoning set/reset and must be acting. Optional for complete and defaults to the current session state. For set: "steps" or "plan" array. For complete: "step_index" or "title".',
        triggerConditions: [
            'When reasoning must define the acting checklist before leaving reasoning.',
            'When reasoning must repair or replace the acting checklist because the objective changed.',
            'When acting completed one execution task and must mark it done.',
        ],
        promptExamples: [
            'I am in reasoning and need to define the acting checklist before leaving reasoning.',
            'I finished step 1 of the acting checklist and will mark it complete.',
            'The old acting checklist is obsolete, so while in reasoning I will reset it and create a new one.',
        ],
        exampleLines: [
            '  @@ace:start planning',
            '  {"action":"set","steps":["Inspect the latest output","Decide whether the result is sufficient"]}',
            '  @@ace:end',
            '',
            '  @@ace:start planning',
            '  {"action":"complete","step_index":0}',
            '  @@ace:end',
            '',
            '  @@ace:start planning',
            '  {"action":"reset"}',
            '  @@ace:end',
        ],
    },
};

export const handlerComplete: ParserBlockHandler = async ({ block, dispatchParserResponse, history_event_index }: ParserBlockArgs) => {
    try {
        const payload = JSON.parse(block.payload.content);
        void history_event_index;
        console.info('[PlanningBlock] Delegated to backend agent runtime; frontend planning mutations are disabled.', payload);
        dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
    } catch (e) {
        console.error('[PlanningBlock] Error processing block:', e);
        dispatchParserResponse(AIParserProtocolState.ERROR);
    }
};