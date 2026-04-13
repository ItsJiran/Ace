import { AIParserProtocolState } from '#/schemas/ai';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ParserBlockArgs, ParserBlockHandler } from '#/schemas/parser';

export const registry: AceRegistryType.Parser = {
    name: 'wait_feedback',
    slug: 'wait_feedback',
    description: 'Pause the stream parser mid-generation to wait for an external interaction or user confirmation.',
    block_schema: {
        is_default_detail: true,
        purpose: 'Halts the INTERNAL STREAM PARSER to wait for an external event. Used when a destructive tool call or an action requires immediate user confirmation BEFORE the stream can safely proceed to the next block.',
        requiredFields: 'None.',
        optionalFields: 'None.',
        triggerConditions: [
            'After proposing a destructive action plan (e.g., deleting files) that needs confirmation mid-stream',
            'When waiting for a specific tool result to resolve before continuing the stream',
        ],
        promptExamples: [],
        exampleLines: [
            '  <wait_feedback>',
            '  Waiting for user to click confirm on the dialogue.',
            '  </wait_feedback>',
        ],
    },
};

export const handler: ParserBlockHandler = async ({ block: _block, dispatchParserResponse }: ParserBlockArgs) => {
    // Pauses the parser loop stream parser, effectively halting AI generation until feedback is provided.
    dispatchParserResponse(AIParserProtocolState.WAITING_FOR_FEEDBACK);
};
