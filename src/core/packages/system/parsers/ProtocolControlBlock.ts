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
    name: 'protocol_control',
    slug: 'protocol_control',
    description: 'Controls the flow of the conversation and AI streaming parsers.',
    block_schema: {
        is_default_detail: true,
        purpose: 'Use this block to control whether the AI automatically continues responding, stops to await user input, or pauses the current stream for confirmation.',
        requiredFields: '"action" (must be "wait_feedback", "end_turn", or "continue_loop")',
        optionalFields: 'None.',
        triggerConditions: [
            '"wait_feedback": When proposing a destructive plan (e.g., deleting a file) and needing mid-stream confirmation before continuing execution.',
            '"continue_loop": When you need to chain multiple tool calls, process their results, or perform a multi-step plan autonomously. Generates another entry immediately after this one.',
            '"end_turn": When you have finished your tasks/response and want to return control to the user explicitly. (This is the default behavior if protocol_control is not called, but using it ensures stability).',
        ],
        promptExamples: [
            'Waiting for user click...',
            'Will iteratively execute the next step.',
            'Awaiting further instructions.'
        ],
        exampleLines: [
            '  @@ace:start protocol_control',
            '  {"action": "continue_loop"}',
            '  @@ace:end',
            '',
            '  @@ace:start protocol_control',
            '  {"action": "wait_feedback"}',
            '  @@ace:end',
        ],
    },
};

export const handlerComplete: ParserBlockHandler = async ({ block, dispatchParserResponse }: ParserBlockArgs) => {
    try {
        const payload = JSON.parse(block.payload.content);
        const action = payload.action;
        const session_uid = block.session_uid;

        if (action === 'wait_feedback') {
            dispatchParserResponse(AIParserProtocolState.WAITING_FOR_FEEDBACK);
        } else if (action === 'continue_loop') {
            KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                feedback_loop_status: 'continue_requested'
            } as Partial<AISession>);
            dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
        } else if (action === 'end_turn') {
            KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                feedback_loop_status: 'completed'
            } as Partial<AISession>);
            dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
        } else {
            console.warn(`[ProtocolControlBlock] Unknown action: ${action}`);
            dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
        }
    } catch (e) {
        console.error(`[ProtocolControlBlock] Error processing block:`, e);
        dispatchParserResponse(AIParserProtocolState.ERROR);
    }
};
