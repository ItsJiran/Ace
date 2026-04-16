/**
 * Prompt Builder State Rules
 *
 * Summary:
 * - centralizes state-specific focus, planning scope, and transition guidance
 * - provides small formatting helpers used by state-oriented prompt sections
 */

import type { AISession } from '#/schemas/ai';

export function describeStateFocus(state: AISession['state']): string {
    if (state === 'Reason') return 'identify what matters, resolve ambiguity, and decide the correct next move';
    if (state === 'Plan') return 'standalone Plan state is reserved; use planning to define the current state checklist';
    if (state === 'Act') return 'execute the exact next planned action only';
    if (state === 'Observe') return 'inspect and interpret the latest result against the active context';
    if (state === 'Reflect') return 'evaluate whether the previous flow was correct, sufficient, or needs correction';
    if (state === 'Finalize') return 'package the final validated result back to the user';

    return 'continue from the latest validated state';
}

export function describeStatePlanningScope(state: AISession['state']): string {
    if (state === 'Reason') {
        return 'decide what should happen next, check whether an existing parser block is capable, decide whether autonomous looping is justified, decide whether clarification is needed, and decide whether the task can return directly';
    }

    if (state === 'Plan') {
        return 'standalone Plan state is reserved; only use planning here to define or refine the checklist for the active state';
    }

    if (state === 'Act') {
        return 'execute the selected action only, including which parser block to call or which direct operation to perform; do not use this plan to analyze or validate outcomes';
    }

    if (state === 'Observe') {
        return 'inspect the latest result, decide whether it satisfies the state objective, decide whether plan steps can be marked complete, and decide whether replanning is needed';
    }

    if (state === 'Reflect') {
        return 'evaluate whether the overall flow was correct, whether corrections are needed, and whether the current approach should be revised before continuing';
    }

    if (state === 'Finalize') {
        return 'package and deliver the validated result only; do not introduce new execution work unless the final output is blocked by a missing required result';
    }

    return 'stay aligned with the active state objective only';
}

export function getAllowedNextStates(state: AISession['state']): string[] {
    if (state === 'Reason') return ['Act', 'Finalize'];
    if (state === 'Plan') return ['Reason', 'Act', 'Finalize'];
    if (state === 'Act') return ['Observe', 'Finalize'];
    if (state === 'Observe') return ['Reason', 'Reflect', 'Finalize'];
    if (state === 'Reflect') return ['Reason', 'Finalize'];
    if (state === 'Finalize') return ['Finalize'];

    return [];
}

export function clipForPrompt(value: string, maxLength: number = 280): string {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 3)}...`;
}