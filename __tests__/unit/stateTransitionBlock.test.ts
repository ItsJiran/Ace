import { beforeEach, describe, expect, it } from 'vitest';

import { AIParserProtocolState, type AISession } from '#/schemas/ai';
import { handlerComplete } from '#/core/packages/system/parsers/StateTransitionBlock';
import { KernelEngine } from '#/services/kernelEngine';

function createSession(state: AISession['state']): AISession {
    const processUid = KernelEngine.spawnProcess('test_state_transition').process_uid;

    return {
        session_uid: 'session-state-transition',
        process_uid: processUid,
        sdk: 'openai',
        model: 'gpt-test',
        status: 'idle',
        state,
        state_cycle_index: 0,
        autonomous_follow_up_loop_status: 'none',
        error_payload: undefined,
        turn_index: 0,
        turns: [],
        plan: [],
        active_parser_blocks: [],
        context: [],
        context_start_index: 0,
        context_end_index: 0,
        working_memory: [],
        history: {},
        history_start_index: 0,
        history_end_index: 0,
    };
}

describe('StateTransitionBlock', () => {
    beforeEach(() => {
        KernelEngine.resetKernelSpace();
    });

    it('stops immediately when Observe transitions to Finalize', async () => {
        const session = createSession('observing');
        KernelEngine.createMemory(session, session.process_uid, `system:ai_session:${session.session_uid}:state`);

        const responses: string[] = [];
        await handlerComplete({
            block: {
                session_uid: session.session_uid,
                process_uid: session.process_uid,
                turn_index: 0,
                entry_index: 0,
                block_index: 0,
                block_slug: 'state_transition',
                payload: { content: JSON.stringify({ next_state: 'finalizing', reason: 'Done.' }) },
            },
            lifecycle: 'complete',
            history_event_index: 0,
            dispatchParserResponse: (detail) => responses.push(detail),
            abortCurrentResponseBuffer: new AbortController().signal,
        });

        expect(responses).toEqual([AIParserProtocolState.STOP_CURRENT_RESPONSE]);
        const stored = KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`) as AISession;
        expect(stored.state).toBe('finalizing');
        expect(stored.state_cycle_index).toBe(0);
        expect(stored.history[0]?.responses).toEqual(expect.arrayContaining([
            expect.objectContaining({
                index: 0,
                block_slug: 'state_transition',
                status: 'completed',
                summary: 'State transitioned from observing to finalizing for cycle 1. Reason: Done.',
            }),
        ]));
    });

    it('lets Act hand off only to Observe', async () => {
        const session = createSession('acting');
        KernelEngine.createMemory(session, session.process_uid, `system:ai_session:${session.session_uid}:state`);

        const responses: string[] = [];
        await handlerComplete({
            block: {
                session_uid: session.session_uid,
                process_uid: session.process_uid,
                turn_index: 0,
                entry_index: 0,
                block_index: 0,
                block_slug: 'state_transition',
                payload: { content: JSON.stringify({ next_state: 'observing', reason: 'Action completed and now needs validation.' }) },
            },
            lifecycle: 'complete',
            history_event_index: 0,
            dispatchParserResponse: (detail) => responses.push(detail),
            abortCurrentResponseBuffer: new AbortController().signal,
        });

        expect(responses).toEqual([AIParserProtocolState.STOP_CURRENT_RESPONSE]);
        const stored = KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`) as AISession;
        expect(stored.state).toBe('observing');
        expect(stored.state_cycle_index).toBe(0);
        expect(stored.history[0]?.responses).toEqual(expect.arrayContaining([
            expect.objectContaining({
                index: 0,
                block_slug: 'state_transition',
                status: 'completed',
                summary: 'State transitioned from acting to observing for cycle 1. Reason: Action completed and now needs validation.',
            }),
        ]));
    });

    it('stops the current pass and continues the loop for non-Finalize transitions', async () => {
        const session = createSession('reasoning');
        KernelEngine.createMemory(session, session.process_uid, `system:ai_session:${session.session_uid}:state`);

        const responses: string[] = [];
        await handlerComplete({
            block: {
                session_uid: session.session_uid,
                process_uid: session.process_uid,
                turn_index: 0,
                entry_index: 0,
                block_index: 0,
                block_slug: 'state_transition',
                payload: { content: JSON.stringify({ next_state: 'acting', reason: 'Need to execute next step.' }) },
            },
            lifecycle: 'complete',
            history_event_index: 0,
            dispatchParserResponse: (detail) => responses.push(detail),
            abortCurrentResponseBuffer: new AbortController().signal,
        });

        expect(responses).toEqual([AIParserProtocolState.STOP_CURRENT_RESPONSE]);
        const stored = KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`) as AISession;
        expect(stored.state).toBe('acting');
        expect(stored.state_cycle_index).toBe(0);
        expect(stored.history[0]?.responses).toEqual(expect.arrayContaining([
            expect.objectContaining({
                index: 0,
                block_slug: 'state_transition',
                status: 'completed',
                summary: 'State transitioned from reasoning to acting for cycle 1. Reason: Need to execute next step.',
            }),
        ]));
    });

    it('increments the cycle only when Observe returns to Reason', async () => {
        const session = createSession('observing');
        KernelEngine.createMemory(session, session.process_uid, `system:ai_session:${session.session_uid}:state`);

        const responses: string[] = [];
        await handlerComplete({
            block: {
                session_uid: session.session_uid,
                process_uid: session.process_uid,
                turn_index: 0,
                entry_index: 0,
                block_index: 0,
                block_slug: 'state_transition',
                payload: { content: JSON.stringify({ next_state: 'reasoning', reason: 'Observed an execution failure and need replanning.' }) },
            },
            lifecycle: 'complete',
            history_event_index: 0,
            dispatchParserResponse: (detail) => responses.push(detail),
            abortCurrentResponseBuffer: new AbortController().signal,
        });

        expect(responses).toEqual([AIParserProtocolState.STOP_CURRENT_RESPONSE]);
        const stored = KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`) as AISession;
        expect(stored.state).toBe('reasoning');
        expect(stored.state_cycle_index).toBe(1);
        expect(stored.history[0]?.responses).toEqual(expect.arrayContaining([
            expect.objectContaining({
                index: 0,
                block_slug: 'state_transition',
                status: 'completed',
                summary: 'State transitioned from observing to reasoning for cycle 2. Reason: Observed an execution failure and need replanning.',
            }),
        ]));
    });
});