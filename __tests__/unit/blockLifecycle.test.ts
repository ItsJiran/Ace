import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIBlock, AISessionRuntime } from '#/schemas/ai';
import { AIParserProtocolState } from '#/schemas/ai';
import type { ParserBlockRuntime } from '#/schemas/parser';
import * as HistoryEvents from '#/services/aiGateway/historyEvents';
import { KernelEngine } from '#/services/kernelEngine';
import { RegistryEngine } from '#/services/registryEngine';
import { invokeBlockLifecycleHandler } from '#/services/aiGateway/sub-services/interactionParserLoop/blockLifecycle';

function createSession(): AISessionRuntime {
    const processUid = KernelEngine.spawnProcess('test_block_lifecycle').process_uid;

    return {
        session_uid: 'session-block-lifecycle',
        process_uid: processUid,
        sdk: 'openai',
        model: 'gpt-test',
        status: 'idle',
        state: 'reasoning',
        state_cycle_index: 0,
        autonomous_follow_up_loop_status: 'none',
        error_payload: undefined,
        turn_index: 0,
        turns: [
            {
                at: Date.now(),
                status: 'streaming',
                user_renderers: [],
                assistant_renderers: [],
                active_entry_index: 0,
                entries: [
                    {
                        response: '',
                        response_buffer_memory_uid: undefined,
                        prompt: 'test prompt',
                        composed_prompt: 'test prompt',
                        blocks: [],
                        status: 'streaming',
                    },
                ],
            },
        ],
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

function createBlock(block_slug: string, session: AISessionRuntime): AIBlock {
    return {
        session_uid: session.session_uid,
        process_uid: session.process_uid,
        turn_index: 0,
        entry_index: 0,
        block_index: 0,
        block_slug,
        payload: { content: '{"action":"noop"}' },
    };
}

describe('blockLifecycle', () => {
    beforeEach(() => {
        KernelEngine.resetKernelSpace();
        vi.restoreAllMocks();
    });

    it('skips history slot allocation for delegated cognitive blocks', async () => {
        const session = createSession();
        KernelEngine.createMemory(session, session.process_uid, `system:ai_session:${session.session_uid}:state`);

        const allocateSpy = vi.spyOn(HistoryEvents, 'allocateHistoryEventSlot');
        const getParserBlockSpy = vi.spyOn(RegistryEngine, 'getParserBlock').mockReturnValue({
            handlers: {
                complete: async ({ dispatchParserResponse }) => dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK),
            },
        } as unknown as ParserBlockRuntime);

        const result = await invokeBlockLifecycleHandler(
            session.session_uid,
            createBlock('planning', session),
            'complete',
            new AbortController(),
        );

        expect(result).toBe(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
        expect(allocateSpy).not.toHaveBeenCalled();
        expect(getParserBlockSpy).toHaveBeenCalledWith('planning');
    });

    it('still allocates history slots for non-delegated blocks', async () => {
        const session = createSession();
        KernelEngine.createMemory(session, session.process_uid, `system:ai_session:${session.session_uid}:state`);

        const allocateSpy = vi.spyOn(HistoryEvents, 'allocateHistoryEventSlot');
        vi.spyOn(RegistryEngine, 'getParserBlock').mockReturnValue({
            handlers: {
                complete: async ({ dispatchParserResponse }) => dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK),
            },
        } as unknown as ParserBlockRuntime);

        const result = await invokeBlockLifecycleHandler(
            session.session_uid,
            createBlock('tool', session),
            'complete',
            new AbortController(),
        );

        expect(result).toBe(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
        expect(allocateSpy).toHaveBeenCalledOnce();
    });
});