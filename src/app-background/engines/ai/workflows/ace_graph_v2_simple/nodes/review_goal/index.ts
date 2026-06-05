import { getConfig } from '@langchain/langgraph';
import { emitNodeStart } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV2State, AceAgentGoal } from '../../types';

// ── Helpers ────────────────────────────────────────────────────────────────

function findNextGoal(goals: AceAgentGoal[]): AceAgentGoal | undefined {
    return goals.find((g) => g.status === 'pending' || g.status === 'in_progress');
}

// ── Node ───────────────────────────────────────────────────────────────────

/**
 * Review Goal — determines what to do after a goal completes or fails.
 *
 * Flow:
 * - Has next goal → orchestrator_step (activate next goal)
 * - No more goals → END
 */
export function createReviewGoalNode() {
    return async function reviewGoalNode(state: AceAgentV2State): Promise<Partial<AceAgentV2State>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'review_goal', 'ace-v2', state).catch(() => {});

        if (state.is_stopped) return { result_summary: 'Stopped.', from_node: 'review_goal' };

        const currentGoal = state.current_goal;
        if (!currentGoal) return { target_node: '__end__', result_summary: 'No goal.', from_node: 'review_goal' };

        const goals = state.goals ?? [];

        // Check for next goal
        const nextGoal = findNextGoal(goals.filter((g) => g.id !== currentGoal.id));
        if (nextGoal) {
            return {
                current_goal: nextGoal,
                current_step: nextGoal.steps[0],
                target_node: 'orchestrator_step',
                target_node_reason: `Goal "${currentGoal.objective}" [${currentGoal.status}] → next: "${nextGoal.objective}".`,
                from_node: 'review_goal',
                result_summary: `Moving to next goal: ${nextGoal.objective}`,
            };
        }

        // No more goals
        return {
            target_node: '__end__',
            from_node: 'review_goal',
            result_summary: 'All goals complete.',
        };
    };
}
