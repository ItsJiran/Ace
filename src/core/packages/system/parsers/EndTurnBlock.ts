import { AIParserProtocolState, AIInteractionLoopProtocolState } from '#/schemas/ai';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ParserBlockArgs, ParserBlockHandler } from '#/schemas/parser';

export const registry: AceRegistryType.Parser = {
    name: 'end_turn',
    slug: 'end_turn',
    description: 'Ends the current autonomous interaction loop and returns control to the user.',
    block_schema: {
        is_default_detail: true,
        purpose: 'Signals the OUTER INTERACTION LOOP to stop. The stream itself will complete normally, but the AI will not chain into another automated turn. Use this to explicitly return the dialogue and input control back to the user after finishing your objectives.',
        requiredFields: 'None.',
        optionalFields: 'None.',
        triggerConditions: [
            'When finishing the current turn and returning control back to the user normally',
            'After answering a question and awaiting further questions',
        ],
        promptExamples: [],
        exampleLines: [
            '  <end_turn>',
            '  Return control to user',
            '  </end_turn>',
        ],
    },
};

export const handler: ParserBlockHandler = async ({ block: _block, dispatchParserResponse }: ParserBlockArgs) => {
    // For now, this simply continues the inner stream parser.
    // The actual integration of changing `session.feedback_loop_status = STOP`
    // or emitting a stop event will be handled by the Interaction Loop when it receives
    // this specific block, or we can explicitly write to KernelEngine here if required.
    // But as a parser protocol, this block doesn't pause mid-stream, so we emit CONTINUE.
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};
