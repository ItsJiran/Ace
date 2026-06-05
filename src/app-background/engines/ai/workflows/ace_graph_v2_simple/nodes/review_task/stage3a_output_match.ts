/**
 * Stage 3a (success branch) — Check if the task output matches expectations.
 */

import { SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import mainModel from '../../../../models/main_model';
import type { AceAgentV2State, AceAgentStep, AceAgentTask } from '../../types';

export const OutputMatchVerdict = z.object({
    output_matches: z.boolean().describe('Whether the task output matches expectations (relevant, complete, correct format).'),
    fix_instruction: z.string().describe('What to adjust when retrying (if mismatch).'),
    reasoning: z.string().describe('Why output matches or not.'),
});

export type OutputMatchResult = z.infer<typeof OutputMatchVerdict>;

export async function evaluateOutputMatch(
    _state: AceAgentV2State,
    step: AceAgentStep,
    task: AceAgentTask,
    maxRetries: number,
): Promise<OutputMatchResult> {
    const model = await mainModel({ runtime: getConfig() as never, structuredOutput: OutputMatchVerdict });
    return await model.invoke([
        new SystemMessage([
            'This task SUCCEEDED (completed without error). Now evaluate whether the OUTPUT matches expectations.',
            '',
            'Output MATCHES when: result is relevant, reasonably complete, and addresses the task summary.',
            'Output MISMATCHES when: result is off-topic, incomplete, wrong format,',
            'or doesn\'t address what the task asked for.',
            '',
            'If mismatch, provide a concrete fix_instruction for the action node to retry with adjusted expectations.',
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
