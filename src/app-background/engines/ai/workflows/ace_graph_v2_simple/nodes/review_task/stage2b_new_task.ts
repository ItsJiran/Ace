/**
 * Stage 2b (failed + no retry, or success + output retries exhausted) —
 * Check if the step can still be saved by creating a DIFFERENT task.
 */

import { SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import mainModel from '../../../../models/main_model';
import type { AceAgentV2State, AceAgentStep, AceAgentTask } from '../../types';

export const NewTaskCheckVerdict = z.object({
    can_new_task: z.boolean().describe('Whether creating a different task can solve the step.'),
    task_suggestion: z.string().describe('What kind of task to create (type + summary).'),
    reasoning: z.string().describe('Why a new task will or won\'t help.'),
});

export type NewTaskCheckResult = z.infer<typeof NewTaskCheckVerdict>;

export async function evaluateNewTask(
    _state: AceAgentV2State,
    step: AceAgentStep,
    task: AceAgentTask,
): Promise<NewTaskCheckResult> {
    const model = await mainModel({ runtime: getConfig() as never, structuredOutput: NewTaskCheckVerdict });
    return await model.invoke([
        new SystemMessage([
            'This task cannot be retried further. Decide whether the STEP can still be saved by creating a DIFFERENT task.',
            '',
            'A new task makes sense when: a different approach/tool could achieve the same sub-goal,',
            'or the step needs a prerequisite task first.',
            'Give up when: the step itself is impossible, all approaches are blocked,',
            'or the goal is fundamentally unreachable.',
            '',
            'If a new task could help, describe what kind of task (type + summary) in task_suggestion.',
            '',
            '--- TASK CONTEXT ---',
            `Step phase: ${step.phase}`,
            `Failed task: ${task.type} / ${task.summary}`,
            `Task output: ${task.output ? JSON.stringify(task.output).slice(0, 500) : '(empty)'}`,
            '',
            'All tasks in this step:',
            ...step.tasks.map((t) => `  [${t.status}] ${t.type}/${t.summary}`),
        ].join('\n')),
    ]);
}
