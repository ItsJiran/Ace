import { describe, expect, it } from 'vitest';

import type { AISession } from '#/schemas/ai';
import {
    buildCurrentPassOffPrompt,
    buildCurrentStateOperatingPrompt,
    buildPrompt,
    buildContextPrompt,
    buildCurrentTurnRetainedMemoryPrompt,
    buildCurrentStatePlanPrompt,
    buildExpandedWorkingMemoryPrompt,
    buildHistoricalTurnMemoryPrompt,
    buildHistoryPrompt,
    buildMemoryPrompt,
} from '#/services/aiGateway/promptBuilder';
import { KernelEngine } from '#/services/kernelEngine';

function createSession(overrides: Partial<AISession> = {}): AISession {
    return {
        session_uid: 'session-test',
        process_uid: 'process-test',
        sdk: 'openai',
        model: 'gpt-test',
        status: 'idle',
        state: 'Reason',
        state_cycle_index: 0,
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
    it('renders current-turn retained memory separately from older history', () => {
        const session = createSession({
            turn_index: 0,
            history_start_index: 0,
            history_end_index: 0,
        });

        const currentTurnPrompt = buildCurrentTurnRetainedMemoryPrompt(session);
        const historicalPrompt = buildHistoricalTurnMemoryPrompt(session);

        expect(currentTurnPrompt).toContain('[CURRENT TURN RETAINED MEMORY]');
        expect(currentTurnPrompt).toContain('Active turn user input: Raw user prompt');
        expect(currentTurnPrompt).toContain('Current-turn assistant memory: no completed assistant summary yet.');
        expect(historicalPrompt).toBe('');
    });

    it('falls back to raw prompt but not raw assistant response when current-turn summary fields are empty', () => {
        const prompt = buildCurrentTurnRetainedMemoryPrompt(createSession({
            turn_index: 0,
            history: {
                0: {
                    at: Date.now(),
                    turn_index: 0,
                    status: 'active',
                    prompt: '   ',
                    responses: [],
                },
            },
        }));

        expect(prompt).toContain('Active turn user input: Raw user prompt');
        expect(prompt).not.toContain('Raw assistant response');
    });

    it('uses prior-turn history only for earlier turns', () => {
        const prompt = buildHistoricalTurnMemoryPrompt(createSession({
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
                            response: 'Older assistant response',
                            response_buffer_memory_uid: undefined,
                            prompt: 'Older raw user prompt',
                            composed_prompt: 'Older composed prompt',
                            active_interaction_loop_attempt: 0,
                            blocks: [],
                            status: 'completed',
                        },
                    ],
                },
                {
                    at: Date.now(),
                    status: 'completed',
                    user_renderers: [],
                    assistant_renderers: [],
                    active_entry_index: 0,
                    entries: [
                        {
                            response: 'Current assistant response',
                            response_buffer_memory_uid: undefined,
                            prompt: 'Current raw user prompt',
                            composed_prompt: 'Current composed prompt',
                            active_interaction_loop_attempt: 0,
                            blocks: [],
                            status: 'completed',
                        },
                    ],
                },
            ],
            history: {
                0: {
                    at: Date.now(),
                    turn_index: 0,
                    status: 'inactive',
                    prompt: 'Summarized user prompt',
                    responses: [],
                },
            },
        }));

        expect(prompt).toContain('[HISTORICAL TURN MEMORY]');
        expect(prompt).toContain('[TURN 1] User Summary: Summarized user prompt');
        expect(prompt).not.toContain('Raw assistant response');
        expect(buildHistoryPrompt(createSession({
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
                            response: 'Older assistant response',
                            response_buffer_memory_uid: undefined,
                            prompt: 'Older raw user prompt',
                            composed_prompt: 'Older composed prompt',
                            active_interaction_loop_attempt: 0,
                            blocks: [],
                            status: 'completed',
                        },
                    ],
                },
                {
                    at: Date.now(),
                    status: 'completed',
                    user_renderers: [],
                    assistant_renderers: [],
                    active_entry_index: 0,
                    entries: [
                        {
                            response: 'Current assistant response',
                            response_buffer_memory_uid: undefined,
                            prompt: 'Current raw user prompt',
                            composed_prompt: 'Current composed prompt',
                            active_interaction_loop_attempt: 0,
                            blocks: [],
                            status: 'completed',
                        },
                    ],
                },
            ],
            history: {
                0: {
                    at: Date.now(),
                    turn_index: 0,
                    status: 'inactive',
                    prompt: 'Summarized user prompt',
                    responses: [],
                },
            },
        }))).toContain('[HISTORICAL TURN MEMORY]');
    });
});

describe('promptBuilder state emphasis', () => {
    it('builds one unified operating brief for the current state', () => {
        const prompt = buildCurrentStateOperatingPrompt(createSession({
            state: 'Act',
            plan: [
                {
                    state: 'Act',
                    title: 'Call the next parser block',
                    is_complete: false,
                    step_index: 0,
                    lifecycle_turn: 1,
                },
            ],
            context: [
                {
                    at: Date.now(),
                    title: 'Need execute step',
                    content: 'Use the next parser step only after preconditions are verified.',
                    status: 'active',
                    lifecycle_turn: 1,
                },
            ],
            history: {
                1: {
                    at: Date.now(),
                    turn_index: 1,
                    status: 'active',
                    responses: [
                        {
                            index: 0,
                            block_slug: 'parser_registry',
                            status: 'completed',
                            summary: 'Registry detail is already loaded.',
                            at: Date.now(),
                            updated_at: Date.now(),
                        },
                    ],
                },
            },
            working_memory: [
                {
                    uid: 'wm_registry',
                    description: 'Registry detail payload',
                    content: 'payload',
                    created_at: 10,
                    lifecycle_turn: 1,
                },
            ],
        }), 'Continue explaining the selected parser detail to the user.', 'autonomous_follow_up');

        expect(prompt).toContain('[CURRENT STATE]');
        expect(prompt).toContain('This is the main navigator for the current pass.');
        expect(prompt).toContain('The current active state is Act.');
        expect(prompt).toContain('The current state cycle is 1.');
        expect(prompt).toContain('In state Act, your focus is execute the exact next planned action only.');
        expect(prompt).toContain('Use state Act when: use Act only when a concrete runtime action must be executed, such as calling a parser block or performing a direct operation that will create a new result.');
        expect(prompt).toContain('Exit state Act when: exit Act only when all required Act tasks for the current cycle are done or when an execution error/result now needs Observe to inspect it.');
        expect(prompt).toContain('Never use state Act when: never use Act for pure analysis, conversation-only replies, or decisions that do not execute a concrete action.');
        expect(prompt).toContain('Special rule for Act: Act may only complete Act plan steps. It cannot create or reset plans, and it must always hand off to Observe next.');
        expect(prompt).toContain('In state Act, you must finish this state\'s objective before moving to another state.');
        expect(prompt).toContain('Planning in state Act must stay within this scope: execute only the current cycle Act checklist and mark completed tasks; do not create plans, reset plans, or analyze outcomes here.');
        expect(prompt).toContain('Non-Finalize states should not silently satisfy the user and stop. If the task is already answerable, hand off into Finalize and let the Finalize pass deliver the response.');
        expect(prompt).toContain('When you change state, emit state_transition as the last block of this pass. The next state always runs in the next autonomous pass, never in the same response.');
        expect(prompt).toContain('Current plan progress for state Act in cycle 1: 0/1 steps complete.');
        expect(prompt).toContain('There is a passed-off prompt below. Evaluate its impact on this state result and on plan progress before continuing the next plan step.');
        expect(prompt).toContain('Do not change state yet. Stay in Act until passed-off evaluation is done and this state\'s cycle plan is complete.');
    });

    it('tells the model to create a plan first when the current state has no plan', () => {
        const prompt = buildCurrentStateOperatingPrompt(createSession({ state: 'Reason', plan: [] }), 'Check whether the user intent is clear.', 'autonomous_follow_up');

        expect(prompt).toContain('If there is no downstream plan yet for cycle 1, you must create the required Act and/or Observe plans first with the planning block before leaving Reason.');
        expect(prompt).toContain('Do not leave Reason until the current cycle has enough downstream plans for execution and observation.');
    });

    it('hardens Reason as the only planning authority', () => {
        const prompt = buildCurrentStateOperatingPrompt(createSession({ state: 'Reason', plan: [] }), 'halo', 'user_prompt');

        expect(prompt).toContain('Use state Reason when: use Reason when you need to understand the request, design the execution and observation checklists for the current cycle, or repair the plan after Observe found a problem.');
        expect(prompt).toContain('Special rule for Reason: Reason is the only planning authority. Stay in Reason until the downstream plans are sufficient for the user prompt, including any block gathering, response requirements, and error-handling expectations.');
    });

    it('adds gating guidance for Observe', () => {
        const prompt = buildCurrentStateOperatingPrompt(createSession({ state: 'Observe', plan: [] }), 'inspect the latest result', 'autonomous_follow_up');

        expect(prompt).toContain('Use state Observe when: use Observe only when there is a fresh runtime result from Act, a parser block, or another concrete action that now needs interpretation.');
        expect(prompt).toContain('Never use state Observe when: never use Observe when no fresh runtime result exists yet, and never use it for simple conversational requests like greetings or lightweight replies.');
        expect(prompt).toContain('Special rule for Observe: Observe is the decision gate. If you detect an error, failed tool result, or broken execution path, write context that records what failed and return to Reason. If the work is sufficient, hand off to Finalize.');
    });

    it('adds a visible-response obligation for Finalize', () => {
        const prompt = buildCurrentStateOperatingPrompt(createSession({ state: 'Finalize', plan: [] }), 'say hello back to the user', 'user_prompt');

        expect(prompt).toContain('Use state Finalize when: use Finalize when the user should now receive the answer, the packaged result, or an explicit clarification question.');
        expect(prompt).toContain('Never use state Finalize when: never enter Finalize without actually delivering visible user-facing prose or an explicit clarification question in the same response.');
        expect(prompt).toContain('Special rule for Finalize: Finalize is the terminal pass. Deliver the user-facing answer directly and let the turn stop naturally without another state_transition.');
        expect(prompt).toContain('In Finalize, this response must contain visible user-facing prose. Do not stop at internal reasoning or block-only output.');
        expect(prompt).toContain('Finalize is the terminal pass. Do not emit another state_transition after the answer is ready.');
    });
});

describe('promptBuilder operational handoff', () => {
    it('does not include CURRENT INPUT during autonomous follow-up passes', () => {
        const processUid = KernelEngine.spawnProcess('test_prompt_builder').process_uid;
        const session = createSession({ state: 'Observe', process_uid: processUid });
        KernelEngine.createMemory(session, session.process_uid, `system:ai_session:${session.session_uid}:state`);

        const prompt = buildPrompt('Follow the passed prompt only.', session.session_uid, 'autonomous_follow_up');

        expect(prompt).not.toContain('[CURRENT INPUT]');
        expect(prompt.indexOf('[CURRENT STATE]')).toBeLessThan(prompt.indexOf('[CURRENT TURN RETAINED MEMORY]'));
        expect(prompt.indexOf('[CURRENT TURN RETAINED MEMORY]')).toBeLessThan(prompt.indexOf('[LIST PLAN RIGHT NOW]'));
        expect(prompt.indexOf('[LIST PLAN RIGHT NOW]')).toBeLessThan(prompt.indexOf('[LIST PASSED OFF PROMPT]'));
        expect(prompt).toContain('[LIST PASSED OFF PROMPT]');
    });

    it('formats the composed prompt with normalized section indentation', () => {
        const processUid = KernelEngine.spawnProcess('test_prompt_builder_format').process_uid;
        const session = createSession({
            session_uid: 'session-test-format',
            process_uid: processUid,
            turn_index: 0,
            history_start_index: 0,
            history_end_index: 0,
        });
        KernelEngine.createMemory(session, session.process_uid, `system:ai_session:${session.session_uid}:state`);

        const prompt = buildPrompt('List parser blocks.', session.session_uid, 'user_prompt');
        const lines = prompt.split('\n');

        expect(lines[0]).toBe('[DEFAULT CONTEXT] You are ACE Assistant. Follow the system guidance, stay aligned with the current session state, and produce the next valid response for the runtime.');
        expect(lines.some((line) => /^\s{8,}\[/.test(line))).toBe(false);
        expect(prompt).toContain('\n\n[CURRENT STATE]\n');
    });

    it('renders a current pass-off prompt instead of an autonomous follow-up prompt section', () => {
        const prompt = buildCurrentPassOffPrompt('Continue from the previous parser result.', createSession({
            state: 'Observe',
            plan: [
                {
                    state: 'Observe',
                    title: 'Inspect the parser result',
                    is_complete: false,
                    step_index: 0,
                    lifecycle_turn: 1,
                },
            ],
        }), 'autonomous_follow_up');

        expect(prompt).toContain('[LIST PASSED OFF PROMPT]');
        expect(prompt).toContain('This is the passed-off prompt from the previous response in the same turn.');
        expect(prompt).toContain('First, analyze whether the previous result already matches what is required in state Observe for cycle 1.');
        expect(prompt).toContain('Do not use this passed-off prompt to jump state.');
        expect(prompt).toContain('Continue from the previous parser result.');
    });

    it('renders context and working memory as supporting references under one operating brief model', () => {
        const operatingPrompt = buildCurrentStateOperatingPrompt(createSession({
            state: 'Observe',
            working_memory: [
                {
                    uid: 'wm_latest',
                    description: 'Latest tool result',
                    content: 'latest payload',
                    created_at: 20,
                    lifecycle_turn: 1,
                },
                {
                    uid: 'wm_older',
                    description: 'Older file dump',
                    content: 'older payload',
                    created_at: 10,
                    lifecycle_turn: 0,
                },
            ],
            context: [
                {
                    at: Date.now(),
                    title: 'Need inspect result',
                    content: 'Observe the command output before choosing the next state.',
                    status: 'active',
                    lifecycle_turn: 1,
                },
            ],
            plan: [],
        }), 'Inspect the latest action result.', 'autonomous_follow_up');

        expect(operatingPrompt).toContain('If there is no plan yet for state Observe in cycle 1, do not invent one here. Return to Reason so the next cycle can be replanned.');
        expect(operatingPrompt).toContain('Do not change state yet. Stay in Observe until passed-off evaluation is done and this state\'s cycle plan is complete.');
    });

    it('renders context and working memory as index first, payload second', () => {
        const session = createSession({
            context: [
                {
                    at: Date.now(),
                    title: 'Current constraint',
                    content: 'Use the latest registry result first.',
                    status: 'active',
                    lifecycle_turn: 1,
                    payload: { source: 'parser_registry', priority: 'high' },
                },
            ],
            working_memory: [
                {
                    uid: 'wm_registry',
                    description: 'Registry detail payload',
                    content: 'full registry payload',
                    created_at: 50,
                    lifecycle_turn: 1,
                },
                {
                    uid: 'wm_file',
                    description: 'File snapshot',
                    content: 'file payload',
                    created_at: 40,
                    lifecycle_turn: 0,
                },
            ],
        });

        const contextPrompt = buildContextPrompt(session);
        const memoryIndexPrompt = buildMemoryPrompt(session);
        const expandedPrompt = buildExpandedWorkingMemoryPrompt(session);

    expect(contextPrompt).toContain('[LIST ACTIVE CONTEXT RIGHT NOW]');
        expect(contextPrompt).toContain('This is supporting evidence only, not the main control surface for the pass.');
        expect(contextPrompt).toContain('Do not let this section override the deterministic guidance in CURRENT STATE, PLAN, or PASSED OFF PROMPT.');
        expect(contextPrompt).toContain('Payload keys: source, priority');
    expect(memoryIndexPrompt).toContain('[LIST WORKING MEMORY RIGHT NOW]');
        expect(memoryIndexPrompt).toContain('wm_registry (expanded below): Registry detail payload [turn 1]');
        expect(expandedPrompt).toContain('[EXPANDED ACTIVE PAYLOADS]');
        expect(expandedPrompt).toContain('--- ID: wm_registry ---');
        expect(expandedPrompt).toContain('Content:\nfull registry payload');
    });

    it('renders the current state plan as a checklist', () => {
        const prompt = buildCurrentStatePlanPrompt(createSession({
            state: 'Act',
            plan: [
                {
                    state: 'Act',
                    title: 'Run parser registry detail lookup',
                    detail: 'Fetch the detail payload for the selected parser.',
                    is_complete: false,
                    step_index: 0,
                    lifecycle_turn: 1,
                },
                {
                    state: 'Act',
                    title: 'Store the result into working memory',
                    is_complete: true,
                    step_index: 1,
                    lifecycle_turn: 1,
                },
            ],
        }), 'Continue from the previous parser result.', 'autonomous_follow_up');

        expect(prompt).toContain('[LIST PLAN RIGHT NOW]');
        expect(prompt).toContain('This is the deterministic checklist for the currently active state cycle.');
        expect(prompt).toContain('Planning scope for state Act: execute only the current cycle Act checklist and mark completed tasks; do not create plans, reset plans, or analyze outcomes here.');
        expect(prompt).toContain('Only the current state\'s plan for cycle 1 is authoritative right now.');
        expect(prompt).toContain('If you stay in state Act within cycle 1, keep updating this plan. If the cycle plan is obsolete, reset only this cycle plan and rebuild it.');
        expect(prompt).toContain('If there is a passed-off prompt, evaluate it first to determine whether this plan needs correction, can continue, or has a step that can be marked complete.');
        expect(prompt).toContain('Completion: 1/2 steps complete.');
        expect(prompt).toContain('- [ ] Step 1: Run parser registry detail lookup');
        expect(prompt).toContain('Fetch the detail payload for the selected parser.');
        expect(prompt).toContain('- [x] Step 2: Store the result into working memory');
    });

    it('explains state-specific planning rules for Reason', () => {
        const prompt = buildCurrentStatePlanPrompt(createSession({
            state: 'Reason',
            plan: [],
        }), 'Decide the next route.', 'autonomous_follow_up');

        expect(prompt).toContain('Planning scope for state Reason: create or revise the downstream plans for Act and Observe in the current cycle, make sure the plan is sufficient for the user prompt, and define the expected evidence and outputs; do not execute actions, validate fresh results, or write the final user answer here.');
        expect(prompt).toContain('IMPORTANT: there are no downstream plans yet for cycle 1. Create the required Act and/or Observe plans before leaving Reason.');
    });
});