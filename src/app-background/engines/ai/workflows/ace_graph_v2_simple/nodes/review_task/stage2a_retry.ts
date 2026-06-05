/**
 * Stage 2a (failed branch) — Check if the task can be fixed by retrying
 * with corrected input/payload.
 */

import { SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import mainModel from '../../../../models/main_model';
import type { AceAgentV2State, AceAgentStep, AceAgentTask } from '../../types';

export const RetryCheckVerdict = z.object({
    can_retry: z.boolean().describe('Whether this failure can be fixed by retrying with corrected input/payload.'),
    fix_instruction: z.string().describe('Concrete instruction for the action node on what to fix.'),
    reasoning: z.string().describe('Why retry will or won\'t work.'),
});

export type RetryCheckResult = z.infer<typeof RetryCheckVerdict>;

export async function evaluateRetry(
    _state: AceAgentV2State,
    step: AceAgentStep,
    task: AceAgentTask,
    maxRetries: number,
): Promise<RetryCheckResult> {
    const model = await mainModel({ runtime: getConfig() as never, structuredOutput: RetryCheckVerdict });
    return await model.invoke([
        new SystemMessage([
            'This task FAILED. Decide whether it can be fixed by retrying with corrected input/payload.',
            '',
            'Retry makes sense when: wrong payload/params, temporary error, small adjustment needed.',
            'Retry does NOT make sense when: fundamentally wrong approach, tool unavailable,',
            'permissions missing, permanent failure, or the task itself is impossible.',
            '',
            'Provide a concrete fix_instruction for the action node if retry is possible.',
            '',
            '--- TASK CONTEXT ---',
            `Step phase: ${step.phase}`,
            `Task: ${task.type} / ${task.summary}`,
            `Payload: ${JSON.stringify(task.payload).slice(0, 300)}`,
            `Output: ${task.output ? JSON.stringify(task.output).slice(0, 500) : '(empty)'}`,
            `Retry #${task.retry_count} / ${task.max_retries || maxRetries}`,
        ].join('\n')),
    ]);
}
