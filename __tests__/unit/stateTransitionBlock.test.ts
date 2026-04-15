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

    it('dispatches stop_current_response when transitioning to Finalize', async () => {
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
                payload: { content: JSON.stringify({ next_state: 'Finalize', reason: 'Done.' }) },
            },
            lifecycle: 'complete',
            dispatchParserResponse: (detail) => responses.push(detail),
            abortCurrentResponseBuffer: new AbortController().signal,
        });

        expect(responses).toEqual([AIParserProtocolState.STOP_CURRENT_RESPONSE]);
        expect((KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`) as AISession).state).toBe('Finalize');
    });

    it('continues parsing for non-Finalize transitions', async () => {
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
            dispatchParserResponse: (detail) => responses.push(detail),
            abortCurrentResponseBuffer: new AbortController().signal,
        });

        expect(responses).toEqual([AIParserProtocolState.CONTINUE_NEXT_BLOCK]);
        expect((KernelEngine.readMemory(`system:ai_session:${session.session_uid}:state`) as AISession).state).toBe('Act');
    });
});