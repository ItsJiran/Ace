/**
 * Stage 2a (task achieved) — Check if the step needs more tasks,
 * or if the step is complete and ready for review_step.
 */

import { SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import type { AceAgentV2State, AceAgentStep, AceAgentTask } from '../../types';

export const MoreTasksVerdict = z.object({
    needs_more_tasks: z.boolean().describe('Whether the current step needs additional tasks to complete its phase.'),
    task_suggestion: z.string().describe('What kind of task to create next (type + summary).'),
    reasoning: z.string().describe('Why more tasks are needed or the step is done.'),
});

export type MoreTasksResult = z.infer<typeof MoreTasksVerdict>;

export async function evaluateMoreTasks(
    _state: AceAgentV2State,
    step: AceAgentStep,
    task: AceAgentTask,
): Promise<MoreTasksResult> {
    return await invokeLLM({
        runtime: getConfig() as never,
        structuredOutput: MoreTasksVerdict,
        messages: [new SystemMessage([
            'This task was ACHIEVED successfully. Now decide whether the current STEP needs MORE tasks.',
            '',
            'More tasks are needed when: the step goal is not fully accomplished,',
            'there are remaining sub-steps, or follow-up actions are required.',
            'Step is done when: all necessary work for this phase is complete.',
            '',
            'If more tasks are needed, describe what kind of task (type + summary) in task_suggestion.',
            '',
            '--- STEP CONTEXT ---',
            `Step phase: ${step.phase}`,
            `Completed task: ${task.type} / ${task.summary}`,
            `Output summary: ${task.output ? JSON.stringify(task.output).slice(0, 300) : '(empty)'}`,
            '',
            'All tasks in this step:',
            ...step.tasks.map((t) => `  [${t.status}] ${t.type}/${t.summary}${t.output ? ` → ${JSON.stringify(t.output).slice(0, 80)}` : ''}`),
        ].join('\n'))],
        nodeName: 'review_task',
        graphName: 'ace-v2',
    });
}
