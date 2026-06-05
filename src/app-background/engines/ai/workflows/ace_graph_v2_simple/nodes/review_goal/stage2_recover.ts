/**
 * Stage 2 (goal not achieved) — Decide whether to adjust the current goal,
 * create a brand new goal, or give up entirely.
 */

import { SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import type { AceAgentV2State, AceAgentGoal } from '../../types';

export const GoalRecoverVerdict = z.object({
    action: z.enum(['adjust_goal', 'new_goal', 'give_up']).describe(
        'adjust_goal=revise the current goal with a different approach. ' +
        'new_goal=the current goal is impossible — create a completely new goal. ' +
        'give_up=no path forward — abandon this goal.',
    ),
    suggestion: z.string().describe(
        'If adjust_goal: what to change about the goal. ' +
        'If new_goal: what the new goal should be about. ' +
        'If give_up: why we cannot continue.',
    ),
    reasoning: z.string().describe('Why this action is the right choice.'),
});

export type GoalRecoverResult = z.infer<typeof GoalRecoverVerdict>;

export async function evaluateGoalRecover(
    _state: AceAgentV2State,
    goal: AceAgentGoal,
): Promise<GoalRecoverResult> {
    return await invokeLLM({
        runtime: getConfig() as never,
        structuredOutput: GoalRecoverVerdict,
        messages: [new SystemMessage([
            'This goal was NOT achieved. Decide how to proceed.',
            '',
            '`adjust_goal` — the goal objective is still valid but needs a different approach or revised steps.',
            '`new_goal` — the current goal approach is fundamentally wrong. A completely new goal is needed.',
            '`give_up` — no path forward exists. The goal should be abandoned.',
            '',
            'Provide a concrete suggestion for the chosen action.',
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
