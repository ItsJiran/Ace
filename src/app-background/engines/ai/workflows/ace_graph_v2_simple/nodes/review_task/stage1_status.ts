/**
 * Stage 1 — Classify task as ACHIEVED or FAILED.
 *
 * Considers both completion status AND output quality:
 * - ACHIEVED: task completed AND output is relevant/useful.
 * - FAILED: task errored, produced empty output, or output is off-topic/wrong.
 */

import { SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import mainModel from '../../../../models/main_model';
import type { AceAgentV2State, AceAgentStep, AceAgentTask } from '../../types';

export const TaskStatusVerdict = z.object({
    status: z.enum(['failed', 'achieved']).describe(
        'failed=action errored, produced empty/invalid output, or output is off-topic/wrong format. ' +
        'achieved=action completed AND output is relevant, useful, and addresses the task summary.',
    ),
    reasoning: z.string().describe('Brief explanation of why the task is considered achieved or failed.'),
});

export type TaskStatusResult = z.infer<typeof TaskStatusVerdict>;

export async function evaluateTaskStatus(_state: AceAgentV2State, step: AceAgentStep, task: AceAgentTask): Promise<TaskStatusResult> {
    const model = await mainModel({ runtime: getConfig() as never, structuredOutput: TaskStatusVerdict });
    return await model.invoke([
        new SystemMessage([
            'Classify whether this task ACHIEVED its goal or FAILED.',
            '',
            'ACHIEVED means: the action completed AND the output is relevant, useful, and addresses the task summary.',
            'FAILED means: the action errored, produced empty/invalid output, or the output is off-topic/wrong/irrelevant.',
            '',
            'Consider both whether the action ran successfully AND whether the result is actually what was needed.',
            '',
            'Only output "achieved" or "failed".',
            '',
            '--- TASK CONTEXT ---',
            `Step phase: ${step.phase}`,
            `Task: ${task.type} / ${task.summary}`,
            `Payload: ${JSON.stringify(task.payload).slice(0, 300)}`,
            `Output: ${task.output ? JSON.stringify(task.output).slice(0, 500) : '(empty)'}`,
        ].join('\n')),
    ]);
}
