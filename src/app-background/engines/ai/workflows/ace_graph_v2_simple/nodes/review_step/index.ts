/**
 * Review Step — evaluates whether a step's tasks were sufficient,
 * then decides: create a new step, or give up and move to review_goal.
 *
 * Flow (each classification uses its own LLM call):
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  review_task → step_done → review_step                           │
 * │       ↓                                                          │
 * │  ┌── Stage 1: Step achieved its phase? ──────────────────────┐  │
 * │  │                                                             │  │
 * │  │  STEP_ACHIEVED ────────────────────────────────────────┐   │  │
 * │  │    │                                                    │   │  │
 * │  │    └─ Stage 2a: Goal complete?                          │   │  │
 * │  │          goal_done → review_goal                        │   │  │
 * │  │          need_next_step → orchestrator_step (+ reason)  │   │  │
 * │  │                                                         │   │  │
 * │  │  STEP_NOT_ACHIEVED ─────────────────────────────────────┘   │  │
 * │  │    │                                                        │  │
 * │  │    └─ Stage 2b: Can recover with new step?                  │  │
 * │  │          can_new_step → orchestrator_step (+ reason)        │  │
 * │  │          give_up → review_goal                              │  │
 * │  └──────────────────────────────────────────────────────────────┘  │
 * │                                                                    │
 * │  Special case: "Aborting Goal" step → review_goal immediately      │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * File layout:
 *   index.ts              — node entry point + routing logic
 *   stage1_evaluate.ts    — Stage 1: did step achieve its phase?
 *   stage2a_goal_check.ts — Stage 2a: is the goal complete?
 *   stage2b_recover.ts    — Stage 2b: can a new step recover?
 */

import { getConfig } from '@langchain/langgraph';
import { emitNodeStart } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV2State } from '../../types';

import { evaluateStepOutcome } from './stage1_evaluate';
import { evaluateGoalComplete } from './stage2a_goal_check';
import { evaluateRecover } from './stage2b_recover';

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
            return {
                target_node: 'review_goal',
                from_node: 'review_step',
                result_summary: 'Goal abandoned by orchestrator.',
            };
        }

        // ══════════════════════════════════════════════════════════════
        // Stage 1: Did the step achieve its phase?
        // ══════════════════════════════════════════════════════════════

        const outcome = await evaluateStepOutcome(state, goal, step);

        // ── Step achieved ────────────────────────────────────────────

        if (outcome.outcome === 'step_achieved') {
            const goalCheck = await evaluateGoalComplete(state, goal);

            if (goalCheck.verdict === 'goal_done') {
                return {
                    target_node: 'review_goal',
                    from_node: 'review_step',
                    result_summary: goalCheck.reasoning,
                };
            }

            // need_next_step
            return {
                target_node: 'orchestrator_step',
                target_node_reason: `Step achieved — create next step: ${goalCheck.next_step_suggestion}`,
                from_node: 'review_step',
                result_summary: goalCheck.reasoning,
            };
        }

        // ── Step not achieved ────────────────────────────────────────

        const recoverCheck = await evaluateRecover(state, goal, step);

        if (recoverCheck.can_new_step) {
            return {
                target_node: 'orchestrator_step',
                target_node_reason: `Step failed — create new step: ${recoverCheck.step_suggestion}`,
                from_node: 'review_step',
                result_summary: recoverCheck.reasoning,
            };
        }

        // Give up → review_goal
        return {
            target_node: 'review_goal',
            from_node: 'review_step',
            result_summary: `Cannot recover goal: ${recoverCheck.reasoning}`,
        };
    };
}
