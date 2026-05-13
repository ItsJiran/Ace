import { AIParserProtocolState, type AISessionRuntime, type AISessionState } from '#/schemas/ai';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ParserBlockArgs, ParserBlockHandler } from '#/schemas/parser';
import { appendHistoryResponseSummary, writeHistoryEventSummary } from '#/services/aiGateway/historyEvents';
import { KernelEngine } from '#/services/kernelEngine';

const ALLOWED_NEXT_STATES: Record<AISessionState, AISessionState[]> = {
    reasoning: ['acting'],
    acting: ['observing'],
    observing: ['reasoning', 'finalizing'],
    finalizing: [],
};

const ACTIVE_MVP_STATES: AISessionState[] = ['reasoning', 'acting', 'observing', 'finalizing'];

export const handlerStart: ParserBlockHandler = async ({ dispatchParserResponse }: ParserBlockArgs) => {
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};

export const handlerChunk: ParserBlockHandler = async ({ dispatchParserResponse }: ParserBlockArgs) => {
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};

export const registry: AceRegistryType.Parser = {
    name: 'state_transition',
    slug: 'state_transition',
    description: 'Updates the session operational state mirror for graph observability and phase tracing.',
    block_schema: {
        is_default_detail: true,
        purpose: 'Use this block to explicitly record the next session state when the backend graph determines that the operational phase changed. This block now acts as an observability boundary for the client session rather than a client-side loop controller.',
        requiredFields: '"next_state" (must be one of reasoning | acting | observing | finalizing for the current MVP).',
        optionalFields: '"reason" or "note" for a short explanation of why the state changes.',
        triggerConditions: [
            'When the response has determined the next phase and the session state should be updated explicitly.',
            'When moving from reasoning into execution.',
            'When an action has completed and the next step should analyze the result.',
            'When observing has validated the work and this same response is already ready to end in finalizing.',
            'Use this as a semantic phase marker emitted by the backend graph when the run should record a state change.',
            'This block is a phase boundary. After state_transition is emitted, the current streamed response should stop immediately on the client.',
            'Transitions into finalizing stop the current response and mark the run as ready to end.',
            'Only transition into finalizing after the visible user-facing answer is already complete in the current response.',
            'Do not use state_transition inside finalizing.',
            'Place state_transition as the last block of the current pass. Do not emit blocks from the next phase after it in the same response.',
            'reasoning may only transition to acting after the required downstream plans are sufficiently defined for the current cycle.',
            'acting may only transition to observing after the planned execution work either completed or produced an execution error that observing must inspect.',
            'observing is the only state that may choose between looping back to reasoning or handing off to finalizing.',
        ],
        promptExamples: [
            'While in reasoning, decide that the next phase should be acting, then emit state_transition as the final block in the response.',
            'While in acting, decide that the next phase should be observing after the runtime action completes, then emit state_transition and stop.',
            'While in observing, after finishing the visible answer, switch to finalizing to record that the turn is ready to complete.',
            'Do not emit acting blocks after switching from reasoning to acting in the same response.',
        ],
        exampleLines: [
            '  @@ace:start state_transition',
            '  {"next_state":"acting","reason":"The next step is a concrete runtime action."}',
            '  @@ace:end',
            '',
            '  @@ace:start state_transition',
            '  {"next_state":"observing","reason":"A fresh runtime result is available and must be analyzed."}',
            '  @@ace:end',
            '',
            '  @@ace:start state_transition',
            '  {"next_state":"finalizing","reason":"The result is complete and ready for the user."}',
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

        const sessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISessionRuntime;
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
        const nextCycleIndex = currentState === 'observing' && nextState === 'reasoning'
            ? currentCycleIndex + 1
            : currentCycleIndex;
        const historySummary = note?.trim()
            ? `State transitioned from ${currentState} to ${nextState} for cycle ${nextCycleIndex + 1}. Reason: ${note.trim()}`
            : `State transitioned from ${currentState} to ${nextState} for cycle ${nextCycleIndex + 1}.`;
        const history = typeof history_event_index === 'number'
            ? writeHistoryEventSummary(
                sessionState,
                sessionState.turn_index,
                history_event_index,
                historySummary,
                { action: 'state_transition', from: currentState, to: nextState, state_cycle_index: nextCycleIndex },
                { block_slug: 'state_transition' },
            )
            : appendHistoryResponseSummary(
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

        dispatchParserResponse(AIParserProtocolState.STOP_CURRENT_RESPONSE);
    } catch (e) {
        console.error(`[StateTransitionBlock] Error processing block:`, e);
        dispatchParserResponse(AIParserProtocolState.ERROR);
    }
};