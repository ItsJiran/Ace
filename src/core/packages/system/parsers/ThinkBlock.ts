import { AIParserProtocolState } from '#/schemas/ai';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ParserBlockArgs, ParserBlockHandler } from '#/schemas/parser';

export const registry: AceRegistryType.Parser = {
    name: 'think',
    slug: 'think',
    description: 'Internal reasoning monologue. Used to think step-by-step before executing actions.',
    block_schema: {
        is_default_detail: true,
        purpose: 'Provides a dedicated space for step-by-step reasoning, planning, and evaluation before calling other tools or producing a final response. This block is entirely internal and not shown to the end-user as their primary response.',
        requiredFields: 'None. The content of the block is raw text.',
        optionalFields: 'None.',
        triggerConditions: [
            'Before calling any tool to formulate a plan',
            'When evaluating user intent that is ambiguous',
            'When breaking down complex multi-step problems',
            'To self-correct if a previous tool call failed',
        ],
        promptExamples: [],
        exampleLines: [
            '  <think>',
            '  The user wants to list all sessions. I should use the registry to find the session inspector window.',
            '  </think>',
        ],
    },
};

export const handler: ParserBlockHandler = async ({ block: _block, dispatchParserResponse }: ParserBlockArgs) => {
    // We just gracefully continue. The text inside <think> is already captured in the session entry blocks payload.
    // console.log(`[ThinkBlock] process=${block.process_uid}: ${block.payload.content?.substring(0, 50)}...`);
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};
