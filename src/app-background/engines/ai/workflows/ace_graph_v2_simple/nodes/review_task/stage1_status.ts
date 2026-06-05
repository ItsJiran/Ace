/**
 * Stage 1 — Classify task as FAILED or SUCCEEDED.
 */

import { SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import mainModel from '../../../../models/main_model';
import type { AceAgentV2State, AceAgentStep, AceAgentTask } from '../../types';

export const TaskStatusVerdict = z.object({
    status: z.enum(['failed', 'success']).describe(
        'failed=action could not complete, returned error, or produced empty/invalid output. ' +
        'success=action completed and produced output (quality reviewed separately).',
    ),
    reasoning: z.string().describe('Brief explanation.'),
});

export type TaskStatusResult = z.infer<typeof TaskStatusVerdict>;

export async function evaluateTaskStatus(_state: AceAgentV2State, step: AceAgentStep, task: AceAgentTask): Promise<TaskStatusResult> {
    const model = await mainModel({ runtime: getConfig() as never, structuredOutput: TaskStatusVerdict });
    return await model.invoke([
        new SystemMessage([
            'Classify whether this task FAILED or SUCCEEDED.',
            '',
            'FAILED means: the action could not complete, returned an error, produced genuinely empty/invalid output,',
            'or the tool call itself failed (permission denied, not found, etc.).',
            'SUCCESS means: the action completed and produced some output — even if the quality still needs review.',
            '',
            'Only output "failed" or "success".',
            '',
            '--- TASK CONTEXT ---',
            `Step phase: ${step.phase}`,
            `Task: ${task.type} / ${task.summary}`,
            `Payload: ${JSON.stringify(task.payload).slice(0, 300)}`,
            `Output: ${task.output ? JSON.stringify(task.output).slice(0, 500) : '(empty)'}`,
        ].join('\n')),
    ]);
}
