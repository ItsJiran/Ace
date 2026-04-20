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

type CurrentStatePlanEntry = ReturnType<typeof getCurrentStatePlanEntries>[number];

type StatePromptContext = {
    session: AISession;
    currentStatePlan: CurrentStatePlanEntry[];
    currentCycleNumber: number;
    hasPassedOffPrompt: boolean;
    nextAllowedStates: string[];
    latestCompletedEntry: ReturnType<typeof getLatestCompletedAssistantEntry>;
};

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
            : session.state === 'reasoning'
                ? `If the evaluation shows that this cycle still has no Act plan, create it first with the planning block.`
                : session.state === 'observing'
                    ? `Use this passed-off prompt to form a verdict about the last Act result. If the execution failed or is insufficient, write context and return to Reason.`
                    : `If the evaluation shows that state ${session.state} still has no plan for cycle ${currentCycleNumber}, return to Reason instead of inventing a new plan here.`}
        ${prompt}`;
    }

    return `[LIST PASSED OFF PROMPT]
    This section is reserved for passed-off prompts from a previous pass.
    - There is no passed-off prompt yet because this is still the initial user pass.
    - Stay focused on the current state and the active plan for that state.`;
}

function createStatePromptContext(session: AISession, prompt: string, promptKind: AIPromptKind): StatePromptContext {
    return {
        session,
        currentStatePlan: getCurrentStatePlanEntries(session),
        currentCycleNumber: (session.state_cycle_index ?? 0) + 1,
        hasPassedOffPrompt: promptKind === 'autonomous_follow_up' && prompt.trim() !== '',
        nextAllowedStates: getAllowedNextStates(session.state),
        latestCompletedEntry: getLatestCompletedAssistantEntry(session),
    };
}

function getCompletedPlanCount(currentStatePlan: CurrentStatePlanEntry[]): number {
    return currentStatePlan.filter((entry) => entry.is_complete).length;
}

function isPlanComplete(currentStatePlan: CurrentStatePlanEntry[]): boolean {
    return currentStatePlan.length > 0 && currentStatePlan.every((entry) => entry.is_complete);
}

function pushOperatingStateHeader(lines: string[], context: StatePromptContext, promptKind: AIPromptKind): void {
    const { session, currentCycleNumber } = context;

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
}

function pushOperatingStateOwnership(lines: string[], context: StatePromptContext): void {
    const { session, currentCycleNumber } = context;

    switch (session.state) {
        case 'reasoning':
            lines.push('- The plan shown below belongs to the current cycle. Reason may prepare the downstream Act plan here before handing off.');
            return;
        case 'observing':
            lines.push('- Observe does not own a plan. Use the latest result, active context, and working memory to produce a verdict.');
            return;
        default:
            lines.push(`- The plan shown below belongs only to state ${session.state} in cycle ${currentCycleNumber}. Do not reuse a stale plan from an earlier cycle.`);
    }
}

function pushOperatingTransitionRules(lines: string[], session: AISession): void {
    if (session.state !== 'finalizing') {
        lines.push('- Non-Finalize states should not silently satisfy the user and stop. If the task is already answerable, finish the visible answer and then transition into Finalize to end the turn.');
        lines.push('- When you change state to Reason or Act or Observe, emit state_transition as the last block of this pass so the next state runs in the next autonomous pass.');
        lines.push('- When you change state to Finalize, only do it after the visible user-facing answer is already complete in the current response. Finalize does not get another follow-up pass.');
        return;
    }

    lines.push('- In Finalize, this response must contain visible user-facing prose. Do not stop at internal reasoning or block-only output.');
    lines.push('- Finalize is the terminal pass. Do not emit another state_transition after the answer is ready.');
}

function pushOperatingLatestResult(lines: string[], latestCompletedEntry: StatePromptContext['latestCompletedEntry']): void {
    if (latestCompletedEntry) {
        lines.push(`- Latest completed result in this turn: ${clipForPrompt(latestCompletedEntry.response)}`);
        return;
    }

    lines.push('- Latest completed result in this turn: none yet.');
}

function pushReasonOperatingPlanStatus(lines: string[], context: StatePromptContext): void {
    const { currentStatePlan, currentCycleNumber, hasPassedOffPrompt, nextAllowedStates } = context;

    if (currentStatePlan.length === 0) {
        lines.push(`- If there is no Act plan yet for cycle ${currentCycleNumber}, you must create it first with the planning block before leaving Reason.`);
        lines.push('- Do not leave Reason until the current cycle has an execution plan that is sufficient for the user prompt.');
        return;
    }

    lines.push(`- Current downstream plan coverage for cycle ${currentCycleNumber}: ${currentStatePlan.length} steps defined across the next states.`);
    lines.push(hasPassedOffPrompt
        ? '- There is a passed-off prompt below. Evaluate its impact on this state result and on plan progress before continuing the next plan step.'
        : '- There is no passed-off prompt. Finish defining the Act plan for this cycle before handing off to Act.');
    lines.push(`- If the downstream plans are already sufficient for the user prompt, you may hand off only to the following states: ${nextAllowedStates.join(' | ')}.`);
}

function pushObserveOperatingPlanStatus(lines: string[]): void {
    lines.push('- Observe does not require a planning block. Summarize what happened in Act, note any failure or insufficiency in context, then choose Reason or Finalize.');
}

function pushFinalizeOperatingPlanStatus(lines: string[], context: StatePromptContext): void {
    if (isPlanComplete(context.currentStatePlan)) {
        lines.push('- Finalize does not require a planning block. Use the validated result and answer the user directly.');
        lines.push('- The Finalize plan is complete. Deliver the user-facing answer now and let the turn end.');
        return;
    }

    lines.push('- Finalize does not require a planning block. Use the validated result and answer the user directly.');
}

function pushActOperatingPlanStatus(lines: string[], context: StatePromptContext): void {
    const { session, currentStatePlan, currentCycleNumber, hasPassedOffPrompt, nextAllowedStates } = context;

    if (currentStatePlan.length === 0) {
        lines.push(`- If there is no plan yet for state ${session.state} in cycle ${currentCycleNumber}, do not invent one here. Return to Reason so the next cycle can be replanned.`);
        lines.push(`- Do not change state yet. Stay in ${session.state} until passed-off evaluation is done and this state's cycle plan is complete.`);
        return;
    }

    const completedSteps = getCompletedPlanCount(currentStatePlan);
    lines.push(`- Current plan progress for state ${session.state} in cycle ${currentCycleNumber}: ${completedSteps}/${currentStatePlan.length} steps complete.`);

    if (isPlanComplete(currentStatePlan)) {
        lines.push(`- All plan steps for state ${session.state} in cycle ${currentCycleNumber} are already complete.`);
        lines.push(`- If the state result is already correct and the plan is fully complete, you may move only to the following states: ${nextAllowedStates.join(' | ')}.`);
        return;
    }

    lines.push(hasPassedOffPrompt
        ? '- There is a passed-off prompt below. Evaluate its impact on this state result and on plan progress before continuing the next plan step.'
        : '- There is no passed-off prompt. Continue the checklist for this state until it is complete.');
    lines.push(`- Do not change state yet. Stay in ${session.state} until passed-off evaluation is done and this state's cycle plan is complete.`);
}

function pushOperatingPlanStatus(lines: string[], context: StatePromptContext): void {
    switch (context.session.state) {
        case 'reasoning':
            pushReasonOperatingPlanStatus(lines, context);
            return;
        case 'observing':
            pushObserveOperatingPlanStatus(lines);
            return;
        case 'finalizing':
            pushFinalizeOperatingPlanStatus(lines, context);
            return;
        default:
            pushActOperatingPlanStatus(lines, context);
    }
}

function pushPlanSectionHeader(lines: string[], context: StatePromptContext): void {
    const { session, currentCycleNumber } = context;

    switch (session.state) {
        case 'reasoning':
            lines.push('This is the deterministic downstream checklist for the current reasoning cycle.');
            lines.push(`This section lists the downstream Act plan for cycle ${currentCycleNumber} of the active turn.`);
            lines.push('- The focus of this section is to make sure the downstream Act plan for this cycle is already sufficient.');
            break;
        case 'observing':
            lines.push('observing does not use a checklist. This section defines the verdict contract for the latest acting result.');
            lines.push(`This section is about how observing should judge the latest result in cycle ${currentCycleNumber} of the active turn.`);
            lines.push('- The focus of this section is to force a verdict from the latest acting result, not to define new work.');
            break;
        default:
            lines.push('This is the deterministic checklist for the currently active state cycle.');
            lines.push(`This plan is the checklist for state ${session.state} in cycle ${currentCycleNumber} of the active turn.`);
            lines.push(`- The focus of this section is to make sure you know whether this state cycle already has a plan and which steps are still incomplete.`);
    }

    lines.push(`- Planning scope for state ${session.state}: ${describeStatePlanningScope(session.state)}.`);
}

function pushReasonPlanSection(lines: string[], context: StatePromptContext): void {
    const { currentStatePlan, currentCycleNumber, hasPassedOffPrompt } = context;

    lines.push('- Only the current cycle\'s acting plan is authoritative right now.');
    lines.push('- While still in reasoning, you may add or reset the downstream acting plan until the cycle is sufficiently specified.');

    if (currentStatePlan.length === 0) {
        lines.push(`- IMPORTANT: there is no acting plan yet for cycle ${currentCycleNumber}. Create it before leaving reasoning.`);
        if (hasPassedOffPrompt) {
            lines.push('- You should still evaluate the passed-off prompt to understand the latest result, but do not leave reasoning before the acting plan exists.');
        }
        return;
    }

    lines.push(hasPassedOffPrompt
        ? '- If there is a passed-off prompt, evaluate it first to determine whether this plan needs correction, can continue, or has a step that can be marked complete.'
        : '- Because there is no passed-off prompt, your main focus is to make sure the downstream plans are sufficiently specified before handing off.');
    lines.push(`- Current execution completion snapshot: ${getCompletedPlanCount(currentStatePlan)}/${currentStatePlan.length} acting steps already marked complete in this cycle.`);
    pushPlanChecklistEntries(lines, currentStatePlan, 'reasoning');
}

function pushObservePlanSection(lines: string[], context: StatePromptContext): void {
    lines.push('- observing has no checklist authority. Use the latest result, context, and working memory to decide whether to return to reasoning or move to finalizing.');
    lines.push('- In observing, summarize what happened, record failures in context when needed, and choose the next state. Do not call planning here.');

    if (context.hasPassedOffPrompt) {
        lines.push('- Use the passed-off prompt as the primary evidence of what acting just produced.');
    }

    lines.push('- If the last acting result failed, was empty, or is insufficient, write a concise context note describing the failure and return to reasoning.');
    lines.push('- If the last acting result is sufficient, write the visible user-facing answer now and then transition to finalizing to stop the loop.');
}

function pushActPlanSection(lines: string[], context: StatePromptContext): void {
    const { session, currentStatePlan, currentCycleNumber, hasPassedOffPrompt } = context;

    lines.push(`- Only the current state's plan for cycle ${currentCycleNumber} is authoritative right now.`);
    lines.push(`- If you stay in state ${session.state} within cycle ${currentCycleNumber}, keep updating this plan. If the cycle plan is obsolete, reset only this cycle plan and rebuild it.`);

    if (currentStatePlan.length === 0) {
        lines.push(`- IMPORTANT: there is no plan yet for state ${session.state} in cycle ${currentCycleNumber}. Do not create one here. Return to reasoning if replanning is required.`);
        if (hasPassedOffPrompt) {
            lines.push(`- You should still evaluate the passed-off prompt to understand the latest result, but do not consider this state complete before the cycle plan for state ${session.state} exists.`);
        }
        return;
    }

    lines.push(hasPassedOffPrompt
        ? '- If there is a passed-off prompt, evaluate it first to determine whether this plan needs correction, can continue, or has a step that can be marked complete.'
        : '- Because there is no passed-off prompt, your main focus is to execute the next plan step.');
    lines.push(`- Completion: ${getCompletedPlanCount(currentStatePlan)}/${currentStatePlan.length} steps complete.`);
    pushPlanChecklistEntries(lines, currentStatePlan, session.state);
}

function pushPlanChecklistEntries(lines: string[], currentStatePlan: CurrentStatePlanEntry[], state: AISession['state']): void {
    for (const entry of currentStatePlan) {
        const statusMark = entry.is_complete ? '[x]' : '[ ]';
        const stepLabel = typeof entry.step_index === 'number' ? `Step ${entry.step_index + 1}` : 'Step';
        lines.push(state === 'reasoning'
            ? `- ${statusMark} [${entry.state}] ${stepLabel}: ${entry.title}`
            : `- ${statusMark} ${stepLabel}: ${entry.title}`);
        if (entry.detail) {
            lines.push(`  ${entry.detail}`);
        }
    }
}

export function buildCurrentStateOperatingPrompt(session: AISession, prompt: string, promptKind: AIPromptKind): string {
    const context = createStatePromptContext(session, prompt, promptKind);

    const lines: string[] = ['[CURRENT STATE]'];
    pushOperatingStateHeader(lines, context, promptKind);
    pushOperatingStateOwnership(lines, context);
    pushOperatingTransitionRules(lines, session);
    pushOperatingLatestResult(lines, context.latestCompletedEntry);
    pushOperatingPlanStatus(lines, context);

    return lines.join('\n');
}

export function buildCurrentStatePlanPrompt(session: AISession, prompt: string, promptKind: AIPromptKind): string {
    const context = createStatePromptContext(session, prompt, promptKind);
    const lines: string[] = ['[LIST PLAN RIGHT NOW]'];
    pushPlanSectionHeader(lines, context);

    switch (session.state) {
        case 'reasoning':
            pushReasonPlanSection(lines, context);
            break;
        case 'observing':
            pushObservePlanSection(lines, context);
            break;
        default:
            pushActPlanSection(lines, context);
            break;
    }

    return lines.join('\n');
}