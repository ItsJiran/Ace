/**
 * Review Goal — evaluates whether a goal has been achieved based on
 * completed steps, toggles goal status, then decides next action.
 *
 * Flow (each classification uses its own LLM call):
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  review_step → review_goal                                       │
 * │       ↓                                                          │
 * │  ┌── Stage 1: Goal achieved? ────────────────────────────────┐  │
 * │  │                                                             │  │
 * │  │  GOAL_ACHIEVED → mark completed → check next goal          │  │
 * │  │    has next → activate it → orchestrator_step              │  │
 * │  │    no next  → END                                          │  │
 * │  │                                                             │  │
 * │  │  GOAL_NOT_ACHIEVED ──────────────────────────────────────┐ │  │
 * │  │    │                                                      │ │  │
 * │  │    └─ Stage 2: Recover?                                   │ │  │
 * │  │          adjust_goal → orchestrator_goal (+ reason)       │ │  │
 * │  │          new_goal    → orchestrator_goal (+ reason)       │ │  │
 * │  │          give_up     → mark failed → check next goal      │ │  │
 * │  └──────────────────────────────────────────────────────────────┘  │
 * └────────────────────────────────────────────────────────────────────┘
 *
 * File layout:
 *   index.ts           — node entry point + helpers + routing logic
 *   stage1_evaluate.ts — Stage 1: is the goal achieved?
 *   stage2_recover.ts  — Stage 2: adjust, new goal, or give up?
 */

import { getConfig } from '@langchain/langgraph';
import { emitNodeStart } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV2State, AceAgentGoal } from '../../types';

import { evaluateGoalOutcome } from './stage1_evaluate';
import { evaluateGoalRecover } from './stage2_recover';

// ── Constants ──────────────────────────────────────────────────────────────

/** Hard limit: max goals before forcing give_up. */
const MAX_GOALS = 5;

// ── Helpers ────────────────────────────────────────────────────────────────

function findNextGoal(goals: AceAgentGoal[], excludeId: string): AceAgentGoal | undefined {
    return goals.find((g) => g.id !== excludeId && (g.status === 'pending' || g.status === 'in_progress'));
}

function markGoalInList(goals: AceAgentGoal[], updated: AceAgentGoal): AceAgentGoal[] {
    return goals.map((g) => (g.id === updated.id ? updated : g));
}

// ── Node ───────────────────────────────────────────────────────────────────

export function createReviewGoalNode() {
    return async function reviewGoalNode(state: AceAgentV2State): Promise<Partial<AceAgentV2State>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'review_goal', 'ace-v2', state).catch(() => {});

        if (state.is_stopped) return { result_summary: 'Stopped.', from_node: 'review_goal' };

        const currentGoal = state.current_goal;
        if (!currentGoal) return { target_node: '__end__', result_summary: 'No goal.', from_node: 'review_goal' };

        const goals = state.goals ?? [];

        // ══════════════════════════════════════════════════════════════
        // Stage 1: Is the goal achieved?
        // ══════════════════════════════════════════════════════════════

        const outcome = await evaluateGoalOutcome(state, currentGoal);

        // ── Goal achieved ────────────────────────────────────────────

        if (outcome.outcome === 'goal_achieved') {
            const completedGoal: AceAgentGoal = { ...currentGoal, status: 'completed' };
            const updatedGoals = markGoalInList(goals, completedGoal);

            const nextGoal = findNextGoal(updatedGoals, currentGoal.id);
            if (nextGoal) {
                return {
                    goals: updatedGoals,
                    current_goal: nextGoal,
                    target_node: 'orchestrator_goal',
                    target_node_reason: `Goal "${completedGoal.objective}" completed → activate next: "${nextGoal.objective}".`,
                    from_node: 'review_goal',
                    result_summary: outcome.reasoning,
                };
            }

            return {
                goals: updatedGoals,
                current_goal: completedGoal,
                target_node: '__end__',
                from_node: 'review_goal',
                result_summary: `All goals complete: ${outcome.reasoning}`,
            };
        }

        // ── Goal not achieved ────────────────────────────────────────

        // Stage 2: Recover?
        const recoverCheck = await evaluateGoalRecover(state, currentGoal);

        if (recoverCheck.action === 'adjust_goal' || recoverCheck.action === 'new_goal') {
            // Gate: prevent infinite goal creation
            if (goals.length >= MAX_GOALS) {
                const failedGoal: AceAgentGoal = { ...currentGoal, status: 'failed' };
                const updatedGoals = markGoalInList(goals, failedGoal);
                return {
                    goals: updatedGoals,
                    current_goal: failedGoal,
                    target_node: '__end__',
                    from_node: 'review_goal',
                    result_summary: `Max goals (${MAX_GOALS}) reached — ending. ${recoverCheck.reasoning}`,
                };
            }

            return {
                target_node: 'orchestrator_goal',
                target_node_reason: `${recoverCheck.action}: ${recoverCheck.suggestion}`,
                from_node: 'review_goal',
                result_summary: recoverCheck.reasoning,
            };
        }

        // give_up → mark goal failed → check next goal
        const failedGoal: AceAgentGoal = { ...currentGoal, status: 'failed' };
        const updatedGoals = markGoalInList(goals, failedGoal);

        const nextGoal = findNextGoal(updatedGoals, currentGoal.id);
        if (nextGoal) {
            return {
                goals: updatedGoals,
                current_goal: nextGoal,
                target_node: 'orchestrator_goal',
                target_node_reason: `Goal "${failedGoal.objective}" failed → activate next: "${nextGoal.objective}".`,
                from_node: 'review_goal',
                result_summary: recoverCheck.reasoning,
            };
        }

        return {
            goals: updatedGoals,
            current_goal: failedGoal,
            target_node: '__end__',
            from_node: 'review_goal',
            result_summary: `All goals exhausted: ${recoverCheck.reasoning}`,
        };
    };
}
