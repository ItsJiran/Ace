/**
 * Stage 2 — Given the step outcome (achieved or failed), decide whether
 * the goal needs another step or we should move to review_goal.
 */

import { SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import type { AceAgentV2State, AceAgentGoal } from '../../types';

export const NextStepVerdict = z.object({
    need_next_step: z.boolean().describe(
        'Whether the goal needs another step. True if there is more work to do toward the goal objective.',
    ),
    step_suggestion: z.string().describe('What kind of step to create next (phase description), if need_next_step is true.'),
    reasoning: z.string().describe('Why another step is needed or why the goal is done / cannot be recovered.'),
});

export type NextStepResult = z.infer<typeof NextStepVerdict>;

export async function evaluateNextStep(
    _state: AceAgentV2State,
    goal: AceAgentGoal,
    stepStatus: 'completed' | 'failed',
): Promise<NextStepResult> {
    const isFailed = stepStatus === 'failed';

    return await invokeLLM({
        runtime: getConfig() as never,
        structuredOutput: NextStepVerdict,
        messages: [new SystemMessage([
            isFailed
                ? 'The current step FAILED. Decide whether the GOAL can still be saved by creating a DIFFERENT step.'
                : 'The current step was COMPLETED successfully. Decide whether the GOAL needs another step.',
            '',
            isFailed
                ? 'A new step makes sense when: a different approach could accomplish the same sub-goal, or the goal needs a prerequisite step first.'
                : 'Another step is needed when: the goal objective is not yet fully accomplished, or follow-up work remains.',
            isFailed
                ? 'Give up (need_next_step=false) when: the goal itself is impossible, all approaches are blocked, or permissions are missing.'
                : 'Step is done (need_next_step=false) when: all necessary work for the goal is complete.',
            '',
            'If another step is needed, describe what kind of step in step_suggestion.',
            '',
            '--- GOAL CONTEXT ---',
            `Goal objective: ${goal.objective}`,
            `Step status: ${stepStatus.toUpperCase()}`,
            '',
            'All steps in this goal:',
            ...goal.steps.map((s) =>
                `  [${s.status}] ${s.phase}${s.output ? ` → ${s.output.slice(0, 120)}` : ''}`,
            ),
        ].join('\n'))],
        nodeName: 'review_step',
        graphName: 'ace-v2',
    });
}
