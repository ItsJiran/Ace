import { AIParserProtocolState, type AISession, type AISessionState } from '#/schemas/ai';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ParserBlockArgs, ParserBlockHandler } from '#/schemas/parser';
import { AIGatewayEngine } from '#/services/aiGatewayEngine';
import { KernelEngine } from '#/services/kernelEngine';

const ALLOWED_NEXT_STATES: Record<AISessionState, AISessionState[]> = {
    Reason: ['Act'],
    Act: ['Observe'],
    Observe: ['Reason', 'Finalize'],
    Finalize: [],
};

const ACTIVE_MVP_STATES: AISessionState[] = ['Reason', 'Act', 'Observe', 'Finalize'];

export const handlerStart: ParserBlockHandler = async ({ dispatchParserResponse }: ParserBlockArgs) => {
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};

export const handlerChunk: ParserBlockHandler = async ({ dispatchParserResponse }: ParserBlockArgs) => {
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};

export const registry: AceRegistryType.Parser = {
    name: 'state_transition',
    slug: 'state_transition',
    description: 'Updates the session operational state for the next pass using a constrained transition graph.',
    block_schema: {
        is_default_detail: true,
        purpose: 'Use this block to explicitly set the next session state when your response determines that the operational phase should change. This keeps the runtime state machine aligned with the AI decision and hands work off to a fresh follow-up pass.',
        requiredFields: '"next_state" (must be one of Reason | Act | Observe | Finalize for the current MVP).',
        optionalFields: '"reason" or "note" for a short explanation of why the state changes.',
        triggerConditions: [
            'When the response has determined the next phase and the session state should be updated explicitly.',
            'When moving from reasoning into execution.',
            'When an action has completed and the next step should analyze the result.',
            'When Observe has validated the work and the next pass should be Finalize for the final user-facing answer.',
            'Use this as the main semantic control block for the autonomous loop. Every valid transition ends the current pass immediately and starts the next state in a fresh pass.',
            'This block is a phase boundary. After state_transition is emitted, the current pass stops immediately.',
            'Transitions into Finalize still continue the loop once so the Finalize pass can generate the visible user-facing answer.',
            'Do not use state_transition inside Finalize. The Finalize pass should end naturally after delivering the answer.',
            'Place state_transition as the last block of the current pass. Do not emit blocks from the next phase after it in the same response.',
            'Reason may only transition to Act after the required downstream plans are sufficiently defined for the current cycle.',
            'Act may only transition to Observe after the planned execution work either completed or produced an execution error that Observe must inspect.',
            'Observe is the only state that may choose between looping back to Reason or handing off to Finalize.',
        ],
        promptExamples: [
            'While in Reason, decide that the next pass should be Act, then emit state_transition and stop the current pass.',
            'While in Act, decide that the next pass should be Observe after the runtime action completes, then emit state_transition and stop.',
            'While in Observe, switch to Finalize because the work is validated and the next pass should package the answer for the user.',
            'Do not emit Act blocks after switching from Reason to Act in the same response.',
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

export const handlerComplete: ParserBlockHandler = async ({ block, dispatchParserResponse, history_event_index }: ParserBlockArgs) => {
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
        const currentCycleIndex = sessionState.state_cycle_index ?? 0;
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
        const nextCycleIndex = currentState === 'Observe' && nextState === 'Reason'
            ? currentCycleIndex + 1
            : currentCycleIndex;
        const historySummary = note?.trim()
            ? `State transitioned from ${currentState} to ${nextState} for cycle ${nextCycleIndex + 1}. Reason: ${note.trim()}`
            : `State transitioned from ${currentState} to ${nextState} for cycle ${nextCycleIndex + 1}.`;
        const history = typeof history_event_index === 'number'
            ? AIGatewayEngine.writeHistoryEventSummary(
                sessionState,
                sessionState.turn_index,
                history_event_index,
                historySummary,
                { action: 'state_transition', from: currentState, to: nextState, state_cycle_index: nextCycleIndex },
                { block_slug: 'state_transition' },
            )
            : AIGatewayEngine.appendHistoryResponseSummary(
                sessionState,
                sessionState.turn_index,
                historySummary,
                { action: 'state_transition', from: currentState, to: nextState, state_cycle_index: nextCycleIndex },
            );

        KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
            state: nextState,
            state_cycle_index: nextCycleIndex,
            context,
            history,
            history_end_index: Math.max(sessionState.history_end_index ?? 0, sessionState.turn_index + 1),
            context_start_index: Math.max(0, nextContextEndIndex - 15),
            context_end_index: nextContextEndIndex,
        } as Partial<AISession>);

        dispatchParserResponse(AIParserProtocolState.STOP_AND_CONTINUE_LOOP);
    } catch (e) {
        console.error(`[StateTransitionBlock] Error processing block:`, e);
        dispatchParserResponse(AIParserProtocolState.ERROR);
    }
};