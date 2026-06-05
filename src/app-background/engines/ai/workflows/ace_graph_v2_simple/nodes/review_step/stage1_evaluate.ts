/**
 * Stage 1 — Evaluate whether the step's completed tasks actually
 * accomplished the step phase.
 */

import { SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import mainModel from '../../../../models/main_model';
import type { AceAgentV2State, AceAgentGoal } from '../../types';

export const StepOutcomeVerdict = z.object({
    outcome: z.enum(['step_achieved', 'step_not_achieved']).describe(
        'step_achieved=the completed tasks sufficiently accomplish the step phase. ' +
        'step_not_achieved=tasks did NOT accomplish the phase — approach failed.',
    ),
    reasoning: z.string().describe('Brief explanation of why the step did or did not succeed.'),
});

export type StepOutcomeResult = z.infer<typeof StepOutcomeVerdict>;

export async function evaluateStepOutcome(
    _state: AceAgentV2State,
    goal: AceAgentGoal,
    step: AceAgentGoal['steps'][number],
): Promise<StepOutcomeResult> {
    const model = await mainModel({ runtime: getConfig() as never, structuredOutput: StepOutcomeVerdict });
    return await model.invoke([
        new SystemMessage([
            'Evaluate whether this step has successfully accomplished its phase.',
            '',
            'Look at the completed tasks — did their outputs actually achieve what the step set out to do?',
            '',
            '`step_achieved` — the completed tasks are sufficient. The step phase is fulfilled.',
            '`step_not_achieved` — the tasks did NOT accomplish the phase. The approach needs rethinking.',
            '',
            'Only output "step_achieved" or "step_not_achieved".',
            '',
            '--- STEP CONTEXT ---',
            `Goal: ${goal.objective}`,
            `Step phase: ${step.phase}`,
            `All steps so far: ${goal.steps.map((s) => `[${s.status}] ${s.phase}`).join(', ')}`,
            '',
            'Tasks in this step:',
            ...step.tasks.map((t) =>
                `  [${t.status}] ${t.type}/${t.summary}${t.output ? ` → ${JSON.stringify(t.output).slice(0, 120)}` : ''}`,
            ),
        ].join('\n')),
    ]);
}
