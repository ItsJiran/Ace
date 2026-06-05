/**
 * Stage 1 — Evaluate whether the goal has been achieved based on
 * all completed steps.
 */

import { SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import type { AceAgentV2State, AceAgentGoal } from '../../types';

export const GoalOutcomeVerdict = z.object({
    outcome: z.enum(['goal_achieved', 'goal_not_achieved']).describe(
        'goal_achieved=the completed steps together satisfy the goal objective. ' +
        'goal_not_achieved=the steps do NOT yet accomplish the goal, or the approach is failing.',
    ),
    reasoning: z.string().describe('Brief explanation of why the goal is or is not achieved.'),
});

export type GoalOutcomeResult = z.infer<typeof GoalOutcomeVerdict>;

export async function evaluateGoalOutcome(
    _state: AceAgentV2State,
    goal: AceAgentGoal,
): Promise<GoalOutcomeResult> {
    return await invokeLLM({
        runtime: getConfig() as never,
        structuredOutput: GoalOutcomeVerdict,
        messages: [new SystemMessage([
            'Evaluate whether this goal has been ACHIEVED based on all steps taken so far.',
            '',
            '`goal_achieved` — the completed steps together satisfy the goal objective. The goal is done.',
            '`goal_not_achieved` — the steps do NOT yet accomplish the goal, the approach is failing,',
            'or more work is needed but cannot be accomplished with additional steps.',
            '',
            'Consider both completed AND failed steps when making your decision.',
            '',
            'Only output "goal_achieved" or "goal_not_achieved".',
            '',
            '--- GOAL CONTEXT ---',
            `Goal objective: ${goal.objective}`,
            `Goal rationale: ${goal.rationale}`,
            '',
            'All steps:',
            ...goal.steps.map((s) =>
                `  [${s.status}] ${s.phase}${s.output ? ` → ${s.output.slice(0, 120)}` : ''}`,
            ),
        ].join('\n'))],
        nodeName: 'review_goal',
        graphName: 'ace-v2',
    });
}
