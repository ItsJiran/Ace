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

    it('lets Observe hand off into a Finalize pass', async () => {
        const session = createSession('Observe');
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
                payload: { content: JSON.stringify({ next_state: 'Finalize', reason: 'Done.' }) },
            },
            lifecycle: 'complete',
            history_event_index: 0,
            dispatchParserResponse: (detail) => responses.push(detail),
            abortCurrentResponseBuffer: new AbortController().signal,
        });

        expect(responses).toEqual([AIParserProtocolState.STOP_AND_CONTINUE_LOOP]);
        const stored = KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`) as AISession;
        expect(stored.state).toBe('Finalize');
        expect(stored.state_cycle_index).toBe(0);
        expect(stored.history[0]?.responses).toEqual(expect.arrayContaining([
            expect.objectContaining({
                index: 0,
                block_slug: 'state_transition',
                status: 'completed',
                summary: 'State transitioned from Observe to Finalize for cycle 1. Reason: Done.',
            }),
        ]));
    });

    it('lets Act hand off only to Observe', async () => {
        const session = createSession('Act');
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
                payload: { content: JSON.stringify({ next_state: 'Observe', reason: 'Action completed and now needs validation.' }) },
            },
            lifecycle: 'complete',
            history_event_index: 0,
            dispatchParserResponse: (detail) => responses.push(detail),
            abortCurrentResponseBuffer: new AbortController().signal,
        });

        expect(responses).toEqual([AIParserProtocolState.STOP_AND_CONTINUE_LOOP]);
        const stored = KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`) as AISession;
        expect(stored.state).toBe('Observe');
        expect(stored.state_cycle_index).toBe(0);
        expect(stored.history[0]?.responses).toEqual(expect.arrayContaining([
            expect.objectContaining({
                index: 0,
                block_slug: 'state_transition',
                status: 'completed',
                summary: 'State transitioned from Act to Observe for cycle 1. Reason: Action completed and now needs validation.',
            }),
        ]));
    });

    it('stops the current pass and continues the loop for non-Finalize transitions', async () => {
        const session = createSession('Reason');
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
                payload: { content: JSON.stringify({ next_state: 'Act', reason: 'Need to execute next step.' }) },
            },
            lifecycle: 'complete',
            history_event_index: 0,
            dispatchParserResponse: (detail) => responses.push(detail),
            abortCurrentResponseBuffer: new AbortController().signal,
        });

        expect(responses).toEqual([AIParserProtocolState.STOP_AND_CONTINUE_LOOP]);
        const stored = KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`) as AISession;
        expect(stored.state).toBe('Act');
        expect(stored.state_cycle_index).toBe(0);
        expect(stored.history[0]?.responses).toEqual(expect.arrayContaining([
            expect.objectContaining({
                index: 0,
                block_slug: 'state_transition',
                status: 'completed',
                summary: 'State transitioned from Reason to Act for cycle 1. Reason: Need to execute next step.',
            }),
        ]));
    });

    it('increments the cycle only when Observe returns to Reason', async () => {
        const session = createSession('Observe');
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
                payload: { content: JSON.stringify({ next_state: 'Reason', reason: 'Observed an execution failure and need replanning.' }) },
            },
            lifecycle: 'complete',
            history_event_index: 0,
            dispatchParserResponse: (detail) => responses.push(detail),
            abortCurrentResponseBuffer: new AbortController().signal,
        });

        expect(responses).toEqual([AIParserProtocolState.STOP_AND_CONTINUE_LOOP]);
        const stored = KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`) as AISession;
        expect(stored.state).toBe('Reason');
        expect(stored.state_cycle_index).toBe(1);
        expect(stored.history[0]?.responses).toEqual(expect.arrayContaining([
            expect.objectContaining({
                index: 0,
                block_slug: 'state_transition',
                status: 'completed',
                summary: 'State transitioned from Observe to Reason for cycle 2. Reason: Observed an execution failure and need replanning.',
            }),
        ]));
    });
});