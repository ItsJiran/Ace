import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import mainModel from '../../../../models/main_model';
import { emitNodeStart } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV2State, AceAgentGoal } from '../../types';

// ── Structured output ──────────────────────────────────────────────────────

const StepReviewOutput = z.object({
    verdict: z.enum(['step_done', 'step_incomplete', 'goal_done'])
        .describe('step_done=step sufficient, goal needs more steps. step_incomplete=tasks insufficient, need new approach. goal_done=goal achieved.'),
    reasoning: z.string(),
});

// ── LLM Review ─────────────────────────────────────────────────────────────

async function reviewWithLLM(state: AceAgentV2State, goal: AceAgentGoal, step: AceAgentGoal['steps'][number]) {
    const model = await mainModel({ runtime: getConfig() as never, structuredOutput: StepReviewOutput });
    return await model.invoke([
        new SystemMessage([
            'Evaluate whether this step has been sufficiently completed.',
            '',
            '- `step_done` — completed tasks are sufficient. Goal still needs more steps.',
            '- `step_incomplete` — tasks are NOT sufficient. Need a different approach.',
            '- `goal_done` — all completed steps achieve the goal. No more steps needed.',
            '',
            'Consider: did the tasks actually accomplish the step phase?',
            'Consider: given all completed steps, is the goal fully met?',
        ].join('\n')),
        ...(state.messages ?? []),
        new AIMessage([
            `Goal: ${goal.objective}`,
            `Current Step: ${step.phase}`,
            `All Steps: ${goal.steps.map((s) => `[${s.status}] ${s.phase}`).join(', ')}`,
            `Tasks: ${step.tasks.map((t) => `[${t.status}] ${t.type}/${t.summary}${t.output ? ` → ${JSON.stringify(t.output).slice(0, 100)}` : ''}`).join(' | ')}`,
        ].join('\n')),
    ]);
}

// ── Node ───────────────────────────────────────────────────────────────────

/**
 * Review Step — evaluates whether a step's tasks are sufficient.
 *
 * Flow:
 * 1. Aborting Goal → mark goal failed → review_goal
 * 2. LLM review:
 *    - step_incomplete → orchestrator_step (new approach)
 *    - step_done → orchestrator_step (next step)
 *    - goal_done → review_goal
 */
export function createReviewStepNode() {
    return async function reviewStepNode(state: AceAgentV2State): Promise<Partial<AceAgentV2State>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'review_step', 'ace-v2', state).catch(() => {});

        if (state.is_stopped) return { result_summary: 'Stopped.', from_node: 'review_step' };

        const goal = state.current_goal;
        const step = state.current_step;
        if (!goal || !step) return { target_node: 'review_goal', result_summary: 'No active step.', from_node: 'review_step' };

        // Give up / aborting goal → mark goal failed → review_goal
        if (step.phase.toLowerCase().includes('aborting goal')) {
            const failedGoal = { ...goal, status: 'failed' as const };
            const goals = state.goals?.map((g) => g.id === failedGoal.id ? failedGoal : g) ?? [failedGoal];
            return {
                goals,
                current_goal: failedGoal,
                target_node: 'review_goal',
                from_node: 'review_step',
                result_summary: 'Goal abandoned.',
            };
        }

        // LLM review
        const review = await reviewWithLLM(state, goal, step);

        if (review.verdict === 'step_incomplete') {
            const failedStep = { ...step, status: 'failed' as const };
            const goalWithFailed = { ...goal, steps: goal.steps.map((s) => s.id === step.id ? failedStep : s) };
            return {
                current_goal: goalWithFailed,
                current_step: undefined,
                target_node: 'orchestrator_step',
                target_node_reason: review.reasoning,
                from_node: 'review_step',
                result_summary: review.reasoning,
            };
        }

        // step_done or goal_done — mark step completed
        const completedStep = { ...step, status: 'completed' as const, output: review.reasoning };
        const updatedGoal = { ...goal, steps: goal.steps.map((s) => s.id === step.id ? completedStep : s) };

        if (review.verdict === 'goal_done') {
            const finalGoal = { ...updatedGoal, status: 'completed' as const };
            const goals = state.goals?.map((g) => g.id === finalGoal.id ? finalGoal : g) ?? [finalGoal];
            return {
                goals,
                current_goal: finalGoal,
                target_node: 'review_goal',
                from_node: 'review_step',
                result_summary: review.reasoning,
            };
        }

        // step_done
        return {
            current_goal: updatedGoal,
            current_step: undefined,
            target_node: 'orchestrator_step',
            target_node_reason: review.reasoning,
            from_node: 'review_step',
            result_summary: review.reasoning,
        };
    };
}
