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
        const currentCycleNumber = (session.state_cycle_index ?? 0) + 1;

        return `[LIST PASSED OFF PROMPT]
        This is the passed-off prompt from the previous response in the same turn.
        - First, analyze whether the previous result already matches what is required in state ${session.state} for cycle ${currentCycleNumber}.
        - Determine whether this passed-off prompt means the plan for state ${session.state} in cycle ${currentCycleNumber} can continue, needs revision, or has a step that can now be marked complete.
        - Do not use this passed-off prompt to jump state. Use it to validate the current state and the state plan shown above.
        - ${hasPlan
            ? `After evaluating the passed-off prompt, return to the plan for state ${session.state} in cycle ${currentCycleNumber} and continue the next incomplete step.`
            : session.state === 'Reason'
                ? `If the evaluation shows that this cycle still has no Act plan, create it first with the planning block.`
                : session.state === 'Observe'
                    ? `Use this passed-off prompt to form a verdict about the last Act result. If the execution failed or is insufficient, write context and return to Reason.`
                    : `If the evaluation shows that state ${session.state} still has no plan for cycle ${currentCycleNumber}, return to Reason instead of inventing a new plan here.`}
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
    const currentCycleNumber = (session.state_cycle_index ?? 0) + 1;

    const lines: string[] = ['[CURRENT STATE]'];
    lines.push('- This is the main navigator for the current pass.');
    lines.push(promptKind === 'autonomous_follow_up'
        ? '- This is a continuation pass inside the same user turn.'
        : '- This is the first pass for a new user turn.');
    lines.push(`- The current active state is ${session.state}.`);
    lines.push(`- The current state cycle is ${currentCycleNumber}.`);
    lines.push(`- In state ${session.state}, your focus is ${describeStateFocus(session.state)}.`);
    lines.push(`- Use state ${session.state} when: ${describeStateUseWhen(session.state)}.`);
    lines.push(`- Exit state ${session.state} when: ${describeStateExitWhen(session.state)}.`);
    lines.push(`- Never use state ${session.state} when: ${describeStateAvoidWhen(session.state)}.`);
    lines.push(`- Special rule for ${session.state}: ${describeStateSpecialRule(session.state)}`);
    lines.push(`- In state ${session.state}, you must finish this state's objective before moving to another state.`);
    lines.push(`- Planning in state ${session.state} must stay within this scope: ${describeStatePlanningScope(session.state)}.`);
    lines.push(session.state === 'Reason'
        ? `- The plan shown below belongs to the current cycle. Reason may prepare the downstream Act plan here before handing off.`
        : session.state === 'Observe'
            ? '- Observe does not own a plan. Use the latest result, active context, and working memory to produce a verdict.'
            : `- The plan shown below belongs only to state ${session.state} in cycle ${currentCycleNumber}. Do not reuse a stale plan from an earlier cycle.`);

    if (session.state !== 'Finalize') {
        lines.push('- Non-Finalize states should not silently satisfy the user and stop. If the task is already answerable, finish the visible answer and then transition into Finalize to end the turn.');
        lines.push('- When you change state to Reason or Act or Observe, emit state_transition as the last block of this pass so the next state runs in the next autonomous pass.');
        lines.push('- When you change state to Finalize, only do it after the visible user-facing answer is already complete in the current response. Finalize does not get another follow-up pass.');
    } else {
        lines.push('- In Finalize, this response must contain visible user-facing prose. Do not stop at internal reasoning or block-only output.');
        lines.push('- Finalize is the terminal pass. Do not emit another state_transition after the answer is ready.');
    }

    if (latestCompletedEntry) {
        lines.push(`- Latest completed result in this turn: ${clipForPrompt(latestCompletedEntry.response)}`);
    } else {
        lines.push('- Latest completed result in this turn: none yet.');
    }

    if (session.state === 'Finalize') {
        lines.push('- Finalize does not require a planning block. Use the validated result and answer the user directly.');
    } else if (session.state === 'Observe') {
        lines.push('- Observe does not require a planning block. Summarize what happened in Act, note any failure or insufficiency in context, then choose Reason or Finalize.');
    } else if (currentStatePlan.length === 0) {
        lines.push(session.state === 'Reason'
            ? `- If there is no Act plan yet for cycle ${currentCycleNumber}, you must create it first with the planning block before leaving Reason.`
            : `- If there is no plan yet for state ${session.state} in cycle ${currentCycleNumber}, do not invent one here. Return to Reason so the next cycle can be replanned.`);
    } else {
        const completedSteps = currentStatePlan.filter((entry) => entry.is_complete).length;
        lines.push(session.state === 'Reason'
            ? `- Current downstream plan coverage for cycle ${currentCycleNumber}: ${currentStatePlan.length} steps defined across the next states.`
            : `- Current plan progress for state ${session.state} in cycle ${currentCycleNumber}: ${completedSteps}/${currentStatePlan.length} steps complete.`);
        if (session.state !== 'Reason' && currentStatePlan.every((entry) => entry.is_complete)) {
            lines.push(`- All plan steps for state ${session.state} in cycle ${currentCycleNumber} are already complete.`);
        } else if (hasPassedOffPrompt) {
            lines.push('- There is a passed-off prompt below. Evaluate its impact on this state result and on plan progress before continuing the next plan step.');
        } else {
            lines.push(session.state === 'Reason'
                ? '- There is no passed-off prompt. Finish defining the Act plan for this cycle before handing off to Act.'
                : '- There is no passed-off prompt. Continue the checklist for this state until it is complete.');
        }
    }

    if (session.state === 'Reason' && currentStatePlan.length > 0) {
        lines.push(`- If the downstream plans are already sufficient for the user prompt, you may hand off only to the following states: ${nextAllowedStates.join(' | ')}.`);
    } else if (currentStatePlan.length > 0 && currentStatePlan.every((entry) => entry.is_complete)) {
        if (session.state === 'Finalize') {
            lines.push('- The Finalize plan is complete. Deliver the user-facing answer now and let the turn end.');
        } else {
            lines.push(`- If the state result is already correct and the plan is fully complete, you may move only to the following states: ${nextAllowedStates.join(' | ')}.`);
        }
    } else {
        if (session.state === 'Reason') {
            lines.push('- Do not leave Reason until the current cycle has an execution plan that is sufficient for the user prompt.');
        } else if (session.state !== 'Finalize') {
            lines.push(`- Do not change state yet. Stay in ${session.state} until passed-off evaluation is done and this state's cycle plan is complete.`);
        }
    }

    return lines.join('\n');
}

export function buildCurrentStatePlanPrompt(session: AISession, prompt: string, promptKind: AIPromptKind): string {
    const currentStatePlan = getCurrentStatePlanEntries(session);
    const hasPassedOffPrompt = promptKind === 'autonomous_follow_up' && prompt.trim() !== '';
    const currentCycleNumber = (session.state_cycle_index ?? 0) + 1;
    const lines: string[] = ['[LIST PLAN RIGHT NOW]'];
    lines.push(session.state === 'Reason'
        ? 'This is the deterministic downstream checklist for the current reasoning cycle.'
        : session.state === 'Observe'
            ? 'Observe does not use a checklist. This section defines the verdict contract for the latest Act result.'
        : 'This is the deterministic checklist for the currently active state cycle.');
    lines.push(session.state === 'Reason'
        ? `This section lists the downstream Act plan for cycle ${currentCycleNumber} of the active turn.`
        : session.state === 'Observe'
            ? `This section is about how Observe should judge the latest result in cycle ${currentCycleNumber} of the active turn.`
        : `This plan is the checklist for state ${session.state} in cycle ${currentCycleNumber} of the active turn.`);
    lines.push(session.state === 'Reason'
        ? '- The focus of this section is to make sure the downstream Act plan for this cycle is already sufficient.'
        : session.state === 'Observe'
            ? '- The focus of this section is to force a verdict from the latest Act result, not to define new work.'
        : `- The focus of this section is to make sure you know whether this state cycle already has a plan and which steps are still incomplete.`);
    lines.push(`- Planning scope for state ${session.state}: ${describeStatePlanningScope(session.state)}.`);
    lines.push(session.state === 'Reason'
        ? `- Only the current cycle's Act plan is authoritative right now.`
        : session.state === 'Observe'
            ? '- Observe has no checklist authority. Use the latest result, context, and working memory to decide whether to return to Reason or move to Finalize.'
        : `- Only the current state's plan for cycle ${currentCycleNumber} is authoritative right now.`);
    lines.push(session.state === 'Reason'
        ? `- While still in Reason, you may add or reset the downstream Act plan until the cycle is sufficiently specified.`
        : session.state === 'Observe'
            ? '- In Observe, summarize what happened, record failures in context when needed, and choose the next state. Do not call planning here.'
        : `- If you stay in state ${session.state} within cycle ${currentCycleNumber}, keep updating this plan. If the cycle plan is obsolete, reset only this cycle plan and rebuild it.`);

    if (session.state === 'Observe') {
        if (hasPassedOffPrompt) {
            lines.push('- Use the passed-off prompt as the primary evidence of what Act just produced.');
        }
        lines.push('- If the last Act result failed, was empty, or is insufficient, write a concise context note describing the failure and return to Reason.');
        lines.push('- If the last Act result is sufficient, write the visible user-facing answer now and then transition to Finalize to stop the loop.');
        return lines.join('\n');
    }

    if (currentStatePlan.length === 0) {
        lines.push(session.state === 'Reason'
            ? `- IMPORTANT: there is no Act plan yet for cycle ${currentCycleNumber}. Create it before leaving Reason.`
            : `- IMPORTANT: there is no plan yet for state ${session.state} in cycle ${currentCycleNumber}. Do not create one here. Return to Reason if replanning is required.`);
        if (hasPassedOffPrompt) {
            lines.push(session.state === 'Reason'
                ? '- You should still evaluate the passed-off prompt to understand the latest result, but do not leave Reason before the Act plan exists.'
                : `- You should still evaluate the passed-off prompt to understand the latest result, but do not consider this state complete before the cycle plan for state ${session.state} exists.`);
        }
        return lines.join('\n');
    }

    const completedCount = currentStatePlan.filter((entry) => entry.is_complete).length;
    if (hasPassedOffPrompt) {
        lines.push('- If there is a passed-off prompt, evaluate it first to determine whether this plan needs correction, can continue, or has a step that can be marked complete.');
    } else {
        lines.push(session.state === 'Reason'
            ? '- Because there is no passed-off prompt, your main focus is to make sure the downstream plans are sufficiently specified before handing off.'
            : '- Because there is no passed-off prompt, your main focus is to execute the next plan step.');
    }
    lines.push(session.state === 'Reason'
        ? `- Current execution completion snapshot: ${completedCount}/${currentStatePlan.length} Act steps already marked complete in this cycle.`
        : `- Completion: ${completedCount}/${currentStatePlan.length} steps complete.`);

    for (const entry of currentStatePlan) {
        const statusMark = entry.is_complete ? '[x]' : '[ ]';
        const stepLabel = typeof entry.step_index === 'number' ? `Step ${entry.step_index + 1}` : 'Step';
        lines.push(session.state === 'Reason'
            ? `- ${statusMark} [${entry.state}] ${stepLabel}: ${entry.title}`
            : `- ${statusMark} ${stepLabel}: ${entry.title}`);
        if (entry.detail) {
            lines.push(`  ${entry.detail}`);
        }
    }

    return lines.join('\n');
}