/**
 * Prompt Builder State Rules
 *
 * Summary:
 * - centralizes state-specific focus, planning scope, and transition guidance
 * - provides small formatting helpers used by state-oriented prompt sections
 */

import type { AISession } from '#/schemas/ai';

type StateRuleSet = {
    focus: string;
    planningScope: string;
    useWhen: string;
    exitWhen: string;
    avoidWhen: string;
    specialRule: string;
    allowedNextStates: string[];
};

const STATE_RULES: Record<AISession['state'], StateRuleSet> = {
    Reason: {
        focus: 'plan the downstream work for the current cycle: decide which Act tasks and Observe checks are needed before the answer can be finalized',
        planningScope: 'create or revise the Act plan for the current cycle, make sure the execution path is sufficient for the user prompt, and define what Observe must verify from the resulting output; do not execute actions, validate fresh results, or write the final user answer here',
        useWhen: 'use Reason when you need to understand the request, design the Act checklist for the current cycle, or repair the execution path after Observe found a problem',
        exitWhen: 'exit Reason only when the current cycle has a sufficient Act plan and the next hand-off to Act is clear',
        avoidWhen: 'never use Reason to perform runtime actions, inspect fresh results, or draft the visible final answer',
        specialRule: 'Reason is the only planning authority. Stay in Reason until the Act plan is sufficient for the user prompt, including any block gathering, response requirements, and error-handling expectations.',
        allowedNextStates: ['Act'],
    },
    Act: {
        focus: 'execute the exact next planned action only',
        planningScope: 'execute only the current cycle Act checklist and mark completed tasks; do not create plans, reset plans, or analyze outcomes here',
        useWhen: 'use Act only when a concrete runtime action must be executed, such as calling a parser block or performing a direct operation that will create a new result',
        exitWhen: 'exit Act only when all required Act tasks for the current cycle are done or when an execution error/result now needs Observe to inspect it',
        avoidWhen: 'never use Act for pure analysis, conversation-only replies, or decisions that do not execute a concrete action',
        specialRule: 'Act may only complete Act plan steps. It cannot create or reset plans, and it must always hand off to Observe next.',
        allowedNextStates: ['Observe'],
    },
    Observe: {
        focus: 'inspect the latest result against the latest response, active context, and working memory, then decide whether the cycle succeeded or failed',
        planningScope: 'inspect the latest result for the current cycle, create context notes about failures or important outcomes, and decide whether to hand back to Reason or move to Finalize; do not create, reset, or complete plans here',
        useWhen: 'use Observe only when there is a fresh runtime result from Act, a parser block, or another concrete action that now needs interpretation',
        exitWhen: 'exit Observe only when the latest result has been evaluated against the current context and it is clear whether the cycle must return to Reason or can finish in Finalize',
        avoidWhen: 'never use Observe when no fresh runtime result exists yet, and never use it for simple conversational requests like greetings or lightweight replies',
        specialRule: 'Observe is the decision gate. If you detect an error, failed tool result, or broken execution path, write context that records what failed and return to Reason. If the work is sufficient, hand off to Finalize. Observe never owns a plan.',
        allowedNextStates: ['Reason', 'Finalize'],
    },
    Finalize: {
        focus: 'package the final validated result back to the user',
        planningScope: 'package and deliver the validated result only; Finalize does not create or complete plans',
        useWhen: 'use Finalize when the user should now receive the answer, the packaged result, or an explicit clarification question',
        exitWhen: 'exit Finalize only when this response already contains the visible user-facing answer or the explicit clarification that should be shown to the user',
        avoidWhen: 'never enter Finalize without actually delivering visible user-facing prose or an explicit clarification question in the same response',
        specialRule: 'Finalize is the terminal pass. Deliver the user-facing answer directly and let the turn stop naturally without another state_transition.',
        allowedNextStates: ['Finalize'],
    },
};

const DEFAULT_STATE_RULES: StateRuleSet = {
    focus: 'continue from the latest validated state',
    planningScope: 'stay aligned with the active state objective only',
    useWhen: 'use this state only when it matches the active objective',
    exitWhen: 'exit this state when its objective is complete',
    avoidWhen: 'never use this state when another state is clearly more appropriate',
    specialRule: 'Stay aligned with the state contract only.',
    allowedNextStates: [],
};

function getStateRules(state: AISession['state']): StateRuleSet {
    return STATE_RULES[state] ?? DEFAULT_STATE_RULES;
}

export function describeStateFocus(state: AISession['state']): string {
    return getStateRules(state).focus;
}

export function describeStatePlanningScope(state: AISession['state']): string {
    return getStateRules(state).planningScope;
}

export function describeStateUseWhen(state: AISession['state']): string {
    return getStateRules(state).useWhen;
}

export function describeStateExitWhen(state: AISession['state']): string {
    return getStateRules(state).exitWhen;
}

export function describeStateAvoidWhen(state: AISession['state']): string {
    return getStateRules(state).avoidWhen;
}

export function describeStateSpecialRule(state: AISession['state']): string {
    return getStateRules(state).specialRule;
}

export function getAllowedNextStates(state: AISession['state']): string[] {
    return getStateRules(state).allowedNextStates;
}

export function clipForPrompt(value: string, maxLength: number = 280): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 3)}...`;
}