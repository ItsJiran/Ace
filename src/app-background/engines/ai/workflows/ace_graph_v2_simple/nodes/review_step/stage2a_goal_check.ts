/**
 * Stage 2a (step achieved) — Check if the overall goal is now complete,
 * or if we need another step to finish.
 */

import { SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import mainModel from '../../../../models/main_model';
import type { AceAgentV2State, AceAgentGoal } from '../../types';

export const GoalCompleteVerdict = z.object({
    verdict: z.enum(['goal_done', 'need_next_step']).describe(
        'goal_done=all completed steps together achieve the goal objective. ' +
        'need_next_step=goal is not yet complete — another step is needed.',
    ),
    next_step_suggestion: z.string().describe('If need_next_step, what kind of step should come next (phase description).'),
    reasoning: z.string().describe('Why the goal is done or what remains to be done.'),
});

export type GoalCompleteResult = z.infer<typeof GoalCompleteVerdict>;

export async function evaluateGoalComplete(
    _state: AceAgentV2State,
    goal: AceAgentGoal,
): Promise<GoalCompleteResult> {
    const model = await mainModel({ runtime: getConfig() as never, structuredOutput: GoalCompleteVerdict });
    return await model.invoke([
        new SystemMessage([
            'The current step was successful. Now decide whether the overall GOAL is complete.',
            '',
            '`goal_done` — all completed steps together satisfy the goal objective. No more steps needed.',
            '`need_next_step` — the goal is not yet fully accomplished. Another step is required.',
            '',
            'If another step is needed, describe what kind of step in next_step_suggestion.',
            '',
            '--- GOAL CONTEXT ---',
            `Goal objective: ${goal.objective}`,
            '',
            'Steps taken:',
            ...goal.steps.map((s) =>
                `  [${s.status}] ${s.phase}${s.output ? ` → ${s.output.slice(0, 100)}` : ''}`,
            ),
        ].join('\n')),
    ]);
}
