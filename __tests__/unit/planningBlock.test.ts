import { beforeEach, describe, expect, it } from 'vitest';

import type { AISession } from '#/schemas/ai';
import { AIParserProtocolState } from '#/schemas/ai';
import { handlerComplete } from '#/core/packages/system/parsers/PlanningBlock';
import { KernelEngine } from '#/services/kernelEngine';

function createSession(state: AISession['state']): AISession {
    const processUid = KernelEngine.spawnProcess('test_planning_block').process_uid;

    return {
        session_uid: 'session-planning-block',
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

describe('PlanningBlock', () => {
    beforeEach(() => {
        KernelEngine.resetKernelSpace();
    });

    it('keeps parser flow open while delegating plan creation to the backend agent runtime', async () => {
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
                block_slug: 'planning',
                payload: { content: JSON.stringify({ action: 'set', target_state: 'acting', steps: ['Inspect result', 'Choose next state'] }) },
            },
            lifecycle: 'complete',
            history_event_index: 0,
            dispatchParserResponse: (detail) => responses.push(detail),
            abortCurrentResponseBuffer: new AbortController().signal,
        });

        const stored = KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`) as AISession;

        expect(responses).toEqual([AIParserProtocolState.CONTINUE_NEXT_BLOCK]);
        expect(stored.plan).toEqual([]);
        expect(stored.history).toEqual({});
    });

    it('does not mutate an existing plan when completion is delegated to the backend agent runtime', async () => {
        const session = createSession('acting');
        session.plan = [
            {
                state: 'acting',
                title: 'Run the command',
                is_complete: false,
                step_index: 0,
                lifecycle_turn: 0,
                lifecycle_cycle: 0,
            },
            {
                state: 'acting',
                title: 'Store the result',
                is_complete: false,
                step_index: 1,
                lifecycle_turn: 0,
                lifecycle_cycle: 0,
            },
        ];
        KernelEngine.createMemory(session, session.process_uid, `system:ai_session:${session.session_uid}:state`);

        const responses: string[] = [];
        await handlerComplete({
            block: {
                session_uid: session.session_uid,
                process_uid: session.process_uid,
                turn_index: 0,
                entry_index: 0,
                block_index: 0,
                block_slug: 'planning',
                payload: { content: JSON.stringify({ action: 'complete', step_index: 0 }) },
            },
            lifecycle: 'complete',
            history_event_index: 0,
            dispatchParserResponse: (detail) => responses.push(detail),
            abortCurrentResponseBuffer: new AbortController().signal,
        });

        const stored = KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`) as AISession;

        expect(responses).toEqual([AIParserProtocolState.CONTINUE_NEXT_BLOCK]);
        expect(stored.plan[0]?.is_complete).toBe(false);
        expect(stored.plan[1]?.is_complete).toBe(false);
        expect(stored.history).toEqual({});
    });

    it('still continues on invalid target state because frontend no longer arbitrates plan rules', async () => {
        const session = createSession('observing');
        session.plan = [
            {
                state: 'acting',
                title: 'Run the command',
                is_complete: false,
                step_index: 0,
                lifecycle_turn: 0,
                lifecycle_cycle: 0,
            },
        ];
        KernelEngine.createMemory(session, session.process_uid, `system:ai_session:${session.session_uid}:state`);

        const responses: string[] = [];
        await handlerComplete({
            block: {
                session_uid: session.session_uid,
                process_uid: session.process_uid,
                turn_index: 0,
                entry_index: 0,
                block_index: 0,
                block_slug: 'planning',
                payload: { content: JSON.stringify({ action: 'complete', target_state: 'invalid', step_index: 0 }) },
            },
            lifecycle: 'complete',
            history_event_index: 0,
            dispatchParserResponse: (detail) => responses.push(detail),
            abortCurrentResponseBuffer: new AbortController().signal,
        });

        const stored = KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`) as AISession;
        expect(responses).toEqual([AIParserProtocolState.CONTINUE_NEXT_BLOCK]);
        expect(stored.plan[0]?.is_complete).toBe(false);
        expect(stored.history).toEqual({});
    });

    it('returns parser error only when the payload is invalid JSON', async () => {
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
                block_slug: 'planning',
                payload: { content: '{"action":"set"' },
            },
            lifecycle: 'complete',
            history_event_index: 0,
            dispatchParserResponse: (detail) => responses.push(detail),
            abortCurrentResponseBuffer: new AbortController().signal,
        });

        const stored = KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`) as AISession;
        expect(responses).toEqual([AIParserProtocolState.ERROR]);
        expect(stored.plan).toEqual([]);
    });
});