/**
 * Prompt Builder State Sections
 *
 * Summary:
 * - renders current-state guidance, per-state planning checklist, and pass-off instructions
 * - keeps deterministic state navigation separate from context and history evidence sections
 */

import type { AISession } from '#/schemas/ai';
import type { AIPromptKind } from './shared';
import { getCurrentStatePlanEntries, getLatestCompletedAssistantEntry } from './selectors';
import {
    clipForPrompt,
    describeStateAvoidWhen,
    describeStateExitWhen,
    describeStateFocus,
    describeStatePlanningScope,
    describeStateSpecialRule,
    describeStateUseWhen,
    getAllowedNextStates,
} from './stateRules';

export function buildPromptInputSection(prompt: string, promptKind: AIPromptKind = 'user_prompt'): string {
    if (promptKind === 'autonomous_follow_up') {
        return '';
    }

    return `[CURRENT INPUT]
    ${prompt}`;
}

export function buildCurrentPassOffPrompt(prompt: string, session: AISession, promptKind: AIPromptKind): string {
    if (promptKind === 'autonomous_follow_up') {
        const currentStatePlan = getCurrentStatePlanEntries(session);
        const hasPlan = currentStatePlan.length > 0;

        return `[LIST PASSED OFF PROMPT]
        This is the passed-off prompt from the previous response in the same turn.
        - First, analyze whether the previous result already matches what is required in state ${session.state}.
        - Determine whether this passed-off prompt means the plan for state ${session.state} can continue, needs revision, or has a step that can now be marked complete.
        - Do not use this passed-off prompt to jump state. Use it to validate the current state and the state plan shown above.
        - ${hasPlan
            ? `After evaluating the passed-off prompt, return to the plan for state ${session.state} and continue the next incomplete step.`
            : `If the evaluation shows that state ${session.state} still has no plan, create the plan for this state first with the planning block.`}
        ${prompt}`;
    }

    return `[LIST PASSED OFF PROMPT]
    This section is reserved for passed-off prompts from a previous pass.
    - There is no passed-off prompt yet because this is still the initial user pass.
    - Stay focused on the current state and the active plan for that state.`;
}

export function buildCurrentStateOperatingPrompt(session: AISession, prompt: string, promptKind: AIPromptKind): string {
    const currentStatePlan = getCurrentStatePlanEntries(session);
    const latestCompletedEntry = getLatestCompletedAssistantEntry(session);
    const nextAllowedStates = getAllowedNextStates(session.state);
    const hasPassedOffPrompt = promptKind === 'autonomous_follow_up' && prompt.trim() !== '';

    const lines: string[] = ['[CURRENT STATE]'];
    lines.push('- This is the main navigator for the current pass.');
    lines.push(promptKind === 'autonomous_follow_up'
        ? '- This is a continuation pass inside the same user turn.'
        : '- This is the first pass for a new user turn.');
    lines.push(`- The current active state is ${session.state}.`);
    lines.push(`- In state ${session.state}, your focus is ${describeStateFocus(session.state)}.`);
    lines.push(`- Use state ${session.state} when: ${describeStateUseWhen(session.state)}.`);
    lines.push(`- Exit state ${session.state} when: ${describeStateExitWhen(session.state)}.`);
    lines.push(`- Never use state ${session.state} when: ${describeStateAvoidWhen(session.state)}.`);
    lines.push(`- Special rule for ${session.state}: ${describeStateSpecialRule(session.state)}`);
    lines.push(`- In state ${session.state}, you must finish this state's objective before moving to another state.`);
    lines.push(`- Planning in state ${session.state} must stay within this scope: ${describeStatePlanningScope(session.state)}.`);

    if (session.state !== 'Finalize') {
        lines.push('- Non-Finalize states should not silently satisfy the user and stop. If the task is already answerable, move to Finalize and deliver the response there.');
    } else {
        lines.push('- In Finalize, this response must contain visible user-facing prose. Do not stop at internal reasoning or block-only output.');
    }

    if (latestCompletedEntry) {
        lines.push(`- Latest completed result in this turn: ${clipForPrompt(latestCompletedEntry.response)}`);
    } else {
        lines.push('- Latest completed result in this turn: none yet.');
    }

    if (currentStatePlan.length === 0) {
        lines.push(`- If there is no plan yet for state ${session.state}, you must create that plan first with the planning block before any other work can be considered complete.`);
    } else {
        const completedSteps = currentStatePlan.filter((entry) => entry.is_complete).length;
        lines.push(`- Current plan progress for state ${session.state}: ${completedSteps}/${currentStatePlan.length} steps complete.`);
        if (currentStatePlan.every((entry) => entry.is_complete)) {
            lines.push(`- All plan steps for state ${session.state} are already complete.`);
        } else if (hasPassedOffPrompt) {
            lines.push('- There is a passed-off prompt below. Evaluate its impact on this state result and on plan progress before continuing the next plan step.');
        } else {
            lines.push('- There is no passed-off prompt. Continue the checklist for this state until it is complete.');
        }
    }

    if (currentStatePlan.length > 0 && currentStatePlan.every((entry) => entry.is_complete)) {
        lines.push(`- If the state result is already correct and the plan is fully complete, you may move only to the following states: ${nextAllowedStates.join(' | ')}.`);
    } else {
        lines.push(`- Do not change state yet. Stay in ${session.state} until passed-off evaluation is done and this state's plan is complete.`);
    }

    return lines.join('\n');
}

export function buildCurrentStatePlanPrompt(session: AISession, prompt: string, promptKind: AIPromptKind): string {
    const currentStatePlan = getCurrentStatePlanEntries(session);
    const hasPassedOffPrompt = promptKind === 'autonomous_follow_up' && prompt.trim() !== '';
    const lines: string[] = ['[LIST PLAN RIGHT NOW]'];
    lines.push('This is the deterministic checklist for the currently active state.');
    lines.push(`This plan is the checklist for state ${session.state} in the active turn.`);
    lines.push(`- The focus of this section is to make sure you know whether this state already has a plan and which steps are still incomplete.`);
    lines.push(`- Planning scope for state ${session.state}: ${describeStatePlanningScope(session.state)}.`);
    lines.push(`- Only the current state's plan is authoritative right now.`);
    lines.push(`- If you re-enter state ${session.state} and its current-turn plan is still valid, reuse it. If it is obsolete, reset only the plan for state ${session.state} and rebuild it.`);

    if (currentStatePlan.length === 0) {
        lines.push(`- IMPORTANT: there is no plan yet for state ${session.state}. Create it first with the planning block.`);
        if (hasPassedOffPrompt) {
            lines.push(`- You should still evaluate the passed-off prompt to understand the latest result, but do not consider this state complete before the plan for state ${session.state} exists.`);
        }
        return lines.join('\n');
    }

    const completedCount = currentStatePlan.filter((entry) => entry.is_complete).length;
    if (hasPassedOffPrompt) {
        lines.push('- If there is a passed-off prompt, evaluate it first to determine whether this plan needs correction, can continue, or has a step that can be marked complete.');
    } else {
        lines.push('- Because there is no passed-off prompt, your main focus is to execute the next plan step.');
    }
    lines.push(`- Completion: ${completedCount}/${currentStatePlan.length} steps complete.`);

    for (const entry of currentStatePlan) {
        const statusMark = entry.is_complete ? '[x]' : '[ ]';
        const stepLabel = typeof entry.step_index === 'number' ? `Step ${entry.step_index + 1}` : 'Step';
        lines.push(`- ${statusMark} ${stepLabel}: ${entry.title}`);
        if (entry.detail) {
            lines.push(`  ${entry.detail}`);
        }
    }

    return lines.join('\n');
}