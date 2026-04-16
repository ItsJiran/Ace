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

export function describeStateUseWhen(state: AISession['state']): string {
    if (state === 'Reason') {
        return 'use Reason when you need to classify the request, decide whether the task is simple or multi-step, determine whether tools are needed, or decide whether you can answer directly';
    }

    if (state === 'Plan') {
        return 'use Plan only when the active state checklist itself must be defined or repaired as a separate planning activity';
    }

    if (state === 'Act') {
        return 'use Act only when a concrete runtime action must be executed, such as calling a parser block or performing a direct operation that will create a new result';
    }

    if (state === 'Observe') {
        return 'use Observe only when there is a fresh runtime result from Act, a parser block, or another concrete action that now needs interpretation';
    }

    if (state === 'Reflect') {
        return 'use Reflect only when the previous flow may be wrong, incomplete, or contradictory and you need to decide whether to correct course';
    }

    if (state === 'Finalize') {
        return 'use Finalize when the user should now receive the answer, the packaged result, or an explicit clarification question';
    }

    return 'use this state only when it matches the active objective';
}

export function describeStateExitWhen(state: AISession['state']): string {
    if (state === 'Reason') {
        return 'exit Reason when the next valid move is clear: either finalize directly, ask a clarification, or move into one concrete next state';
    }

    if (state === 'Plan') {
        return 'exit Plan when the current state has a usable checklist and no additional plan repair is needed';
    }

    if (state === 'Act') {
        return 'exit Act when the planned action has actually been executed or when it is proven unnecessary and the next valid state is clear';
    }

    if (state === 'Observe') {
        return 'exit Observe when the latest result has been interpreted and it is clear whether to continue, correct, or finalize';
    }

    if (state === 'Reflect') {
        return 'exit Reflect when the correction decision is clear and the next state is justified';
    }

    if (state === 'Finalize') {
        return 'exit Finalize only when this response already contains the visible user-facing answer or the explicit clarification that should be shown to the user';
    }

    return 'exit this state when its objective is complete';
}

export function describeStateAvoidWhen(state: AISession['state']): string {
    if (state === 'Reason') {
        return 'never stay in Reason just to restate what is already known once the correct next move is obvious';
    }

    if (state === 'Plan') {
        return 'never use Plan as a default detour for simple tasks that can already proceed or finalize';
    }

    if (state === 'Act') {
        return 'never use Act for pure analysis, conversation-only replies, or decisions that do not execute a concrete action';
    }

    if (state === 'Observe') {
        return 'never use Observe when no fresh runtime result exists yet, and never use it for simple conversational requests like greetings or lightweight replies';
    }

    if (state === 'Reflect') {
        return 'never use Reflect as the default next step when the path is already clear and no correction is needed';
    }

    if (state === 'Finalize') {
        return 'never enter Finalize without actually delivering visible user-facing prose or an explicit clarification question in the same response';
    }

    return 'never use this state when another state is clearly more appropriate';
}

export function describeStateSpecialRule(state: AISession['state']): string {
    if (state === 'Reason') {
        return 'Fast path: if the user request is a greeting, acknowledgement, simple conversational turn, or another request that can be answered directly without tools, prefer moving straight from Reason to Finalize instead of creating a multi-step loop.';
    }

    if (state === 'Act') {
        return 'Act should create a new result. If no concrete action is needed, do not force Act.';
    }

    if (state === 'Observe') {
        return 'Observe is gated by a fresh result. If there is nothing new to inspect in the current turn, do not choose Observe.';
    }

    if (state === 'Reflect') {
        return 'Reflect is for correction, not for padding the loop. Use it only when there is a real reason to revisit the flow.';
    }

    if (state === 'Finalize') {
        return 'Finalize must contain the user-facing answer. Internal summaries, block results, or state reasoning are not sufficient by themselves.';
    }

    return 'Stay aligned with the state contract only.';
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