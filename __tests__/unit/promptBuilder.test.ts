import { describe, expect, it } from 'vitest';

import type { AISession } from '#/schemas/ai';
import {
    buildCurrentPassOffPrompt,
    buildCurrentStateOperatingPrompt,
    buildPrompt,
    buildContextPrompt,
    buildCurrentStatePlanPrompt,
    buildExpandedWorkingMemoryPrompt,
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
    it('includes the current turn so far when it already has completed entries', () => {
        const prompt = buildHistoryPrompt(createSession({
            turn_index: 0,
            history_start_index: 0,
            history_end_index: 0,
        }));

        expect(prompt).toContain('[TURN 1] User: Raw user prompt');
        expect(prompt).toContain('[TURN 1] Assistant: Raw assistant response');
    });

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
                    response: 'Registry detail is already loaded.',
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
        expect(prompt).toContain('In state Act, your focus is execute the exact next planned action only.');
        expect(prompt).toContain('In state Act, you must finish this state\'s objective before moving to another state.');
        expect(prompt).toContain('Planning in state Act must stay within this scope: execute the selected action only, including which parser block to call or which direct operation to perform; do not use this plan to analyze or validate outcomes.');
        expect(prompt).toContain('Current plan progress for state Act: 0/1 steps complete.');
        expect(prompt).toContain('There is a passed-off prompt below. Evaluate its impact on this state result and on plan progress before continuing the next plan step.');
        expect(prompt).toContain('Do not change state yet. Stay in Act until passed-off evaluation is done and this state\'s plan is complete.');
    });

    it('tells the model to create a plan first when the current state has no plan', () => {
        const prompt = buildCurrentStateOperatingPrompt(createSession({ state: 'Reason', plan: [] }), 'Check whether the user intent is clear.', 'autonomous_follow_up');

        expect(prompt).toContain('If there is no plan yet for state Reason, you must create that plan first with the planning block before any other work can be considered complete.');
        expect(prompt).toContain('Do not change state yet. Stay in Reason until passed-off evaluation is done and this state\'s plan is complete.');
    });
});

describe('promptBuilder operational handoff', () => {
    it('does not include CURRENT INPUT during autonomous follow-up passes', () => {
        const processUid = KernelEngine.spawnProcess('test_prompt_builder').process_uid;
        const session = createSession({ state: 'Observe', process_uid: processUid });
        KernelEngine.createMemory(session, session.process_uid, `system:ai_session:${session.session_uid}:state`);

        const prompt = buildPrompt('Follow the passed prompt only.', session.session_uid, 'autonomous_follow_up');

        expect(prompt).not.toContain('[CURRENT INPUT]');
        expect(prompt.indexOf('[CURRENT STATE]')).toBeLessThan(prompt.indexOf('[LIST PLAN RIGHT NOW]'));
        expect(prompt.indexOf('[LIST PLAN RIGHT NOW]')).toBeLessThan(prompt.indexOf('[LIST PASSED OFF PROMPT]'));
        expect(prompt).toContain('[LIST PASSED OFF PROMPT]');
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
        expect(prompt).toContain('First, analyze whether the previous result already matches what is required in state Observe.');
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

        expect(operatingPrompt).toContain('If there is no plan yet for state Observe, you must create that plan first with the planning block before any other work can be considered complete.');
        expect(operatingPrompt).toContain('Do not change state yet. Stay in Observe until passed-off evaluation is done and this state\'s plan is complete.');
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
        expect(prompt).toContain('This is the deterministic checklist for the currently active state.');
        expect(prompt).toContain('Planning scope for state Act: execute the selected action only, including which parser block to call or which direct operation to perform; do not use this plan to analyze or validate outcomes.');
        expect(prompt).toContain('Only the current state\'s plan is authoritative right now.');
        expect(prompt).toContain('If you re-enter state Act and its current-turn plan is still valid, reuse it. If it is obsolete, reset only the plan for state Act and rebuild it.');
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

        expect(prompt).toContain('Planning scope for state Reason: decide what should happen next, check whether an existing parser block is capable, decide whether autonomous looping is justified, decide whether clarification is needed, and decide whether the task can return directly.');
        expect(prompt).toContain('IMPORTANT: there is no plan yet for state Reason. Create it first with the planning block.');
    });
});