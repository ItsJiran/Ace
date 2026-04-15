import { AIParserProtocolState, type AISession, type AISessionState } from '#/schemas/ai';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ParserBlockArgs, ParserBlockHandler } from '#/schemas/parser';
import { KernelEngine } from '#/services/kernelEngine';

const ALLOWED_NEXT_STATES: Record<AISessionState, AISessionState[]> = {
    Reason: ['Act', 'Finalize'],
    Plan: ['Reason', 'Act', 'Finalize'],
    Act: ['Observe'],
    Observe: ['Reason', 'Reflect', 'Finalize'],
    Reflect: ['Reason', 'Finalize'],
    Finalize: ['Finalize'],
};

const ACTIVE_MVP_STATES: AISessionState[] = ['Reason', 'Act', 'Observe', 'Reflect', 'Finalize'];

export const handlerStart: ParserBlockHandler = async ({ dispatchParserResponse }: ParserBlockArgs) => {
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};

export const handlerChunk: ParserBlockHandler = async ({ dispatchParserResponse }: ParserBlockArgs) => {
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};

export const registry: AceRegistryType.Parser = {
    name: 'state_transition',
    slug: 'state_transition',
    description: 'Updates the session operational state for the next step using a constrained transition graph.',
    block_schema: {
        is_default_detail: true,
        purpose: 'Use this block to explicitly set the next session state when your response determines that the operational phase should change. This keeps the runtime state machine aligned with the AI decision.',
        requiredFields: '"next_state" (must be one of Reason | Act | Observe | Reflect | Finalize for the current MVP).',
        optionalFields: '"reason" or "note" for a short explanation of why the state changes.',
        triggerConditions: [
            'When the response has determined the next phase and the session state should be updated explicitly.',
            'When moving from reasoning into execution.',
            'When an action has completed and the next step should analyze the result.',
            'When the task is ready to be packaged back to the user.',
            'Use this as the main semantic control block for the autonomous loop. Finalize ends the turn; non-Finalize states keep the session moving.',
            'When transitioning to Finalize, emit state_transition before the final user-facing prose because the parser stops immediately after this block.',
        ],
        promptExamples: [
            'Switch from Reason to Act before emitting the next concrete action.',
            'Switch from Act to Observe after the runtime action has been chosen.',
            'Switch to Finalize because the task is done and ready for user-facing output.',
            'Before emitting the final visible answer, switch to Finalize.',
        ],
        exampleLines: [
            '  @@ace:start state_transition',
            '  {"next_state":"Act","reason":"The next step is a concrete runtime action."}',
            '  @@ace:end',
            '',
            '  @@ace:start state_transition',
            '  {"next_state":"Observe","reason":"A fresh runtime result is available and must be analyzed."}',
            '  @@ace:end',
            '',
            '  @@ace:start state_transition',
            '  {"next_state":"Finalize","reason":"The result is complete and ready for the user."}',
            '  @@ace:end',
        ],
    },
};

export const handlerComplete: ParserBlockHandler = async ({ block, dispatchParserResponse }: ParserBlockArgs) => {
    try {
        const payload = JSON.parse(block.payload.content);
        const nextState = payload.next_state as AISessionState | undefined;
        const note = typeof payload.reason === 'string'
            ? payload.reason
            : typeof payload.note === 'string'
                ? payload.note
                : undefined;
        const session_uid = block.session_uid;

        const sessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
        if (!sessionState) {
            dispatchParserResponse(AIParserProtocolState.ERROR);
            return;
        }

        if (!nextState || !ACTIVE_MVP_STATES.includes(nextState)) {
            console.warn(`[StateTransitionBlock] 'next_state' is missing or not active in this MVP: ${String(nextState)}`);
            dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
            return;
        }

        const currentState = sessionState.state;
        const allowedNextStates = ALLOWED_NEXT_STATES[currentState] ?? [];
        if (!allowedNextStates.includes(nextState)) {
            console.warn(`[StateTransitionBlock] Invalid transition from ${currentState} to ${nextState}`);
            dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
            return;
        }

        const context = [...(sessionState.context ?? [])];
        context.push({
            at: Date.now(),
            title: `State Transition: ${currentState} -> ${nextState}`,
            content: note?.trim() || `Operational state changed from ${currentState} to ${nextState}.`,
            status: 'active',
            lifecycle_turn: sessionState.turn_index,
            payload: { from: currentState, to: nextState },
        });

        const nextContextEndIndex = context.length - 1;
        KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
            state: nextState,
            context,
            context_start_index: Math.max(0, nextContextEndIndex - 15),
            context_end_index: nextContextEndIndex,
        } as Partial<AISession>);

        dispatchParserResponse(
            nextState === 'Finalize'
                ? AIParserProtocolState.STOP_CURRENT_RESPONSE
                : AIParserProtocolState.CONTINUE_NEXT_BLOCK
        );
    } catch (e) {
        console.error(`[StateTransitionBlock] Error processing block:`, e);
        dispatchParserResponse(AIParserProtocolState.ERROR);
    }
};