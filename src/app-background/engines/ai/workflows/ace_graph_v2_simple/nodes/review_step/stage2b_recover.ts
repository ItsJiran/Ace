/**
 * Stage 2b (step not achieved) — Check if the goal can be recovered
 * by creating a new step with a different approach.
 */

import { SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import mainModel from '../../../../models/main_model';
import type { AceAgentV2State, AceAgentGoal } from '../../types';

export const RecoverVerdict = z.object({
    can_new_step: z.boolean().describe('Whether creating a new step with a different approach can recover the goal.'),
    step_suggestion: z.string().describe('What kind of step to create (phase description).'),
    reasoning: z.string().describe('Why a new step will or won\'t help.'),
});

export type RecoverResult = z.infer<typeof RecoverVerdict>;

export async function evaluateRecover(
    _state: AceAgentV2State,
    goal: AceAgentGoal,
    failedStep: AceAgentGoal['steps'][number],
): Promise<RecoverResult> {
    const model = await mainModel({ runtime: getConfig() as never, structuredOutput: RecoverVerdict });
    return await model.invoke([
        new SystemMessage([
            'The current step did NOT achieve its phase. Decide whether the GOAL can still be saved by creating a DIFFERENT step.',
            '',
            'A new step makes sense when: a different approach could accomplish the same sub-goal,',
            'or the goal needs a prerequisite step first.',
            'Give up when: the goal itself is impossible, all approaches are blocked,',
            'permissions are missing, or the objective is fundamentally unreachable.',
            '',
            'If a new step could help, describe what kind of step in step_suggestion.',
            '',
            '--- CONTEXT ---',
            `Goal objective: ${goal.objective}`,
            `Failed step: ${failedStep.phase}`,
            '',
            'All steps in this goal:',
            ...goal.steps.map((s) =>
                `  [${s.status}] ${s.phase}${s.output ? ` → ${s.output.slice(0, 100)}` : ''}`,
            ),
            '',
            'Tasks in the failed step:',
            ...failedStep.tasks.map((t) =>
                `  [${t.status}] ${t.type}/${t.summary}${t.output ? ` → ${JSON.stringify(t.output).slice(0, 120)}` : ''}`,
            ),
        ].join('\n')),
    ]);
}
