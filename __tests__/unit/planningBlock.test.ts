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

    it('lets Reason create a downstream Act plan without forcing a loop boundary', async () => {
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
                block_slug: 'planning',
                payload: { content: JSON.stringify({ action: 'set', target_state: 'Act', steps: ['Inspect result', 'Choose next state'] }) },
            },
            lifecycle: 'complete',
            history_event_index: 0,
            dispatchParserResponse: (detail) => responses.push(detail),
            abortCurrentResponseBuffer: new AbortController().signal,
        });

        const stored = KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`) as AISession;

        expect(responses).toEqual([AIParserProtocolState.CONTINUE_NEXT_BLOCK]);
        expect(stored.plan).toHaveLength(2);
        expect(stored.plan[0]).toMatchObject({ state: 'Act', title: 'Inspect result', is_complete: false, step_index: 0, lifecycle_cycle: 0 });
        expect(stored.plan[1]).toMatchObject({ state: 'Act', title: 'Choose next state', is_complete: false, step_index: 1, lifecycle_cycle: 0 });
        expect(stored.history[0]?.responses).toEqual(expect.arrayContaining([
            expect.objectContaining({
                index: 0,
                block_slug: 'planning',
                status: 'completed',
                summary: 'Planning created 2 step(s) for state Act in cycle 1.',
            }),
        ]));
    });

    it('marks a scoped plan step complete and keeps parser flow open', async () => {
        const session = createSession('Observe');
        session.plan = [
            {
                state: 'Observe',
                title: 'Interpret output',
                is_complete: false,
                step_index: 0,
                lifecycle_turn: 0,
                lifecycle_cycle: 0,
            },
            {
                state: 'Observe',
                title: 'Decide next state',
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
        expect(stored.plan[0]?.is_complete).toBe(true);
        expect(stored.plan[1]?.is_complete).toBe(false);
        expect(stored.history[0]?.responses).toEqual(expect.arrayContaining([
            expect.objectContaining({
                index: 0,
                block_slug: 'planning',
                status: 'completed',
                summary: 'Planning marked step complete in state Observe for cycle 1: Interpret output.',
            }),
        ]));
    });

    it('rejects set outside Reason', async () => {
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
                block_slug: 'planning',
                payload: { content: JSON.stringify({ action: 'set', target_state: 'Act', steps: ['Do work'] }) },
            },
            lifecycle: 'complete',
            history_event_index: 0,
            dispatchParserResponse: (detail) => responses.push(detail),
            abortCurrentResponseBuffer: new AbortController().signal,
        });

        const stored = KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`) as AISession;
        expect(responses).toEqual([AIParserProtocolState.CONTINUE_NEXT_BLOCK]);
        expect(stored.plan).toEqual([]);
    });
});