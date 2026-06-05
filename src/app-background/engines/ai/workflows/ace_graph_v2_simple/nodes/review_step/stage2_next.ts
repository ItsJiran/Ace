/**
 * Stage 2 — Given the step outcome (achieved or failed), decide whether
 * another step is needed or we should move on.
 */

import { SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import type { AceAgentV2State, AceAgentStep } from '../../types';

export const NextStepVerdict = z.object({
    verdict: z.enum(['need_next_step', 'rethink', 'done']).describe(
        'need_next_step=another step is needed to continue. ' +
        'rethink=stuck or unclear path — go back to thought to re-evaluate intent. ' +
        'done=all work is complete, no more steps needed.',
    ),
    step_suggestion: z.string().describe('If need_next_step: what kind of step next. If rethink: what aspect needs re-evaluation. If done: summary of completion.'),
    reasoning: z.string().describe('Why this verdict was chosen.'),
});

export type NextStepResult = z.infer<typeof NextStepVerdict>;

export async function evaluateNextStep(
    _state: AceAgentV2State,
    allSteps: AceAgentStep[],
    stepStatus: 'completed' | 'failed',
): Promise<NextStepResult> {
    const isFailed = stepStatus === 'failed';

    return await invokeLLM({
        runtime: getConfig() as never,
        structuredOutput: NextStepVerdict,
        messages: [new SystemMessage([
            isFailed
                ? 'The current step FAILED. Decide how to proceed.'
                : 'The current step was COMPLETED successfully. Decide how to proceed.',
            '',
            '`need_next_step` — another step is needed to continue progress.',
            '`rethink` — stuck, unclear path, or approach is failing. Go back to thought for re-evaluation.',
            '`done` — all work is complete. No more steps needed.',
            '',
            isFailed
                ? 'A new step makes sense when: a different approach could accomplish the same sub-problem.'
                : 'Another step is needed when: there is still work remaining.',
            'Choose `rethink` when: you are stuck, the approach keeps failing, or the path forward is unclear.',
            'Choose `done` when: the objective has been fully accomplished.',
            '',
            'Describe the next step or re-evaluation need in step_suggestion.',
            '',
            '--- CONTEXT ---',
            `Step status: ${stepStatus.toUpperCase()}`,
            '',
            'All steps so far:',
            ...allSteps.map((s) =>
                `  [${s.status}] ${s.phase}${s.output ? ` → ${s.output.slice(0, 120)}` : ''}`,
            ),
        ].join('\n'))],
        nodeName: 'review_step',
        graphName: 'ace-v2',
    });
}
