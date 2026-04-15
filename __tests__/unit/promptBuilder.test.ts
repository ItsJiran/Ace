import { describe, expect, it } from 'vitest';

import type { AISession } from '#/schemas/ai';
import { buildHistoryPrompt } from '#/services/aiGateway/promptBuilder';

function createSession(overrides: Partial<AISession> = {}): AISession {
    return {
        session_uid: 'session-test',
        process_uid: 'process-test',
        sdk: 'openai',
        model: 'gpt-test',
        status: 'idle',
        state: 'Reason',
        autonomous_follow_up_loop_status: 'none',
        error_payload: undefined,
        turn_index: 1,
        turns: [
            {
                at: Date.now(),
                status: 'completed',
                user_renderers: [],
                assistant_renderers: [],
                active_entry_index: 0,
                entries: [
                    {
                        response: 'Raw assistant response',
                        response_buffer_memory_uid: undefined,
                        prompt: 'Raw user prompt',
                        composed_prompt: 'Composed prompt',
                        active_interaction_loop_attempt: 0,
                        blocks: [],
                        status: 'completed',
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
        history_end_index: 1,
        ...overrides,
    };
}

describe('promptBuilder history fallback', () => {
    it('falls back to raw prompt and raw response when history summary fields are empty', () => {
        const prompt = buildHistoryPrompt(createSession({
            history: {
                0: {
                    at: Date.now(),
                    turn_index: 0,
                    status: 'active',
                    prompt: '   ',
                    response: '',
                },
            },
        }));

        expect(prompt).toContain('[TURN 1] User: Raw user prompt');
        expect(prompt).toContain('[TURN 1] Assistant: Raw assistant response');
    });

    it('uses available summary fields independently and falls back only for missing sides', () => {
        const prompt = buildHistoryPrompt(createSession({
            history: {
                0: {
                    at: Date.now(),
                    turn_index: 0,
                    status: 'inactive',
                    prompt: 'Summarized user prompt',
                    response: '   ',
                },
            },
        }));

        expect(prompt).toContain('[TURN 1] User Summary: Summarized user prompt');
        expect(prompt).toContain('[TURN 1] Assistant: Raw assistant response');
    });
});