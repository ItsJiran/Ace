/**
 * Review Step — evaluates whether a step achieved its phase,
 * toggles its status, then decides: create a new step or move to review_goal.
 *
 * Flow (each classification uses its own LLM call):
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  review_task → step_done → review_step                           │
 * │       ↓                                                          │
 * │  ┌── Stage 1: Step achieved its phase? ──────────────────────┐  │
 * │  │  (mark step completed / failed based on result)            │  │
 * │  │                                                             │  │
 * │  │  STEP_ACHIEVED ──┐                                         │  │
 * │  │  STEP_NOT_ACHIEVED ─┐                                      │  │
 * │  │                     ↓↓                                     │  │
 * │  │  Stage 2: Need another step?                                │  │
 * │  │    need_next_step → orchestrator_step (+ reason)            │  │
 * │  │    !need_next_step → review_goal                            │  │
 * │  └──────────────────────────────────────────────────────────────┘  │
 * │                                                                    │
 * │  Special case: "Aborting Goal" step → review_goal immediately      │
 * │                                                                    │
 * │  Note: goal completion is decided by review_goal, not here.        │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * File layout:
 *   index.ts           — node entry point + helpers + routing logic
 *   stage1_evaluate.ts — Stage 1: did step achieve its phase?
 *   stage2_next.ts     — Stage 2: does goal need another step?
 */

import { getConfig } from '@langchain/langgraph';
import { emitNodeStart } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV2State, AceAgentGoal, AceAgentStep } from '../../types';

import { evaluateStepOutcome } from './stage1_evaluate';
import { evaluateNextStep } from './stage2_next';

// ── Constants ──────────────────────────────────────────────────────────────

/** Hard limit: max steps per goal before forcing review_goal. */
const MAX_STEPS_PER_GOAL = 8;

// ── Helpers ────────────────────────────────────────────────────────────────

function applyStepStatus(
    goal: AceAgentGoal | undefined,
    step: AceAgentStep | undefined,
    status: AceAgentStep['status'],
    output?: string,
): { goal: AceAgentGoal | undefined; step: AceAgentStep | undefined } {
    if (!goal || !step) return { goal, step };
    const updatedStep: AceAgentStep = { ...step, status, ...(output ? { output } : {}) };
    return {
        goal: { ...goal, steps: goal.steps.map((s) => (s.id === step.id ? updatedStep : s)) },
        step: updatedStep,
    };
}

// ── Node ───────────────────────────────────────────────────────────────────

export function createReviewStepNode() {
    return async function reviewStepNode(state: AceAgentV2State): Promise<Partial<AceAgentV2State>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'review_step', 'ace-v2', state).catch(() => {});

        if (state.is_stopped) return { result_summary: 'Stopped.', from_node: 'review_step' };

        const goal = state.current_goal;
        const step = state.current_step;
        if (!goal || !step) return { target_node: 'review_goal', result_summary: 'No active step.', from_node: 'review_step' };

        // Special case: orchestrator already gave up on this goal
        if (step.phase.toLowerCase().includes('aborting goal')) {
            const { goal: updatedGoal } = applyStepStatus(goal, step, 'failed');
            return {
                current_goal: updatedGoal,
                current_step: undefined,
                target_node: 'review_goal',
                from_node: 'review_step',
                result_summary: 'Goal abandoned by orchestrator.',
            };
        }

        // ══════════════════════════════════════════════════════════════
        // Stage 1: Did the step achieve its phase?
        // ══════════════════════════════════════════════════════════════

        const outcome = await evaluateStepOutcome(state, goal, step);
        const stepStatus: 'completed' | 'failed' =
            outcome.outcome === 'step_achieved' ? 'completed' : 'failed';

        const { goal: updatedGoal } = applyStepStatus(goal, step, stepStatus, outcome.reasoning);

        // ══════════════════════════════════════════════════════════════
        // Stage 2: Does the goal need another step?
        // ══════════════════════════════════════════════════════════════

        const nextCheck = await evaluateNextStep(state, updatedGoal!, stepStatus);

        if (nextCheck.need_next_step) {
            // Gate: prevent infinite step creation
            if (updatedGoal!.steps.length >= MAX_STEPS_PER_GOAL) {
                return {
                    current_goal: updatedGoal,
                    current_step: undefined,
                    target_node: 'review_goal',
                    from_node: 'review_step',
                    result_summary: `Max steps per goal (${MAX_STEPS_PER_GOAL}) reached — forcing goal review.`,
                };
            }

            return {
                current_goal: updatedGoal,
                current_step: undefined,
                target_node: 'orchestrator_step',
                target_node_reason: `Step ${stepStatus} — create next step: ${nextCheck.step_suggestion}`,
                from_node: 'review_step',
                result_summary: nextCheck.reasoning,
            };
        }

        // No more steps needed → review_goal
        return {
            current_goal: updatedGoal,
            current_step: undefined,
            target_node: 'review_goal',
            from_node: 'review_step',
            result_summary: nextCheck.reasoning,
        };
    };
}
