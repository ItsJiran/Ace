import { tool as defineTool } from 'langchain';

import {
    ExecutionBatchRequestSchema,
    ExecutionBatchSchema,
    ExecutionBatchStatuses,
    type ExecutionBatchRequestType,
    type ExecutionBatchResultType,
    type ExecutionBatchType,
} from '#/shared/schemas/ai';

function resolveBatchFromRequest(request: ExecutionBatchRequestType): ExecutionBatchType {
    const timestamp = Date.now();
    const batchId = request.batch.batch_id ?? crypto.randomUUID();

    return {
        batch_id: batchId,
        title: request.batch.title,
        objective: request.batch.objective,
        status: ExecutionBatchStatuses.PENDING,
        summary: undefined,
        notes: request.batch.notes,
        items: request.batch.items.map((item, index) => ({
            item_id: item.item_id ?? `${batchId}:item:${index + 1}`,
            title: item.title,
            instructions: item.instructions,
            status: item.status,
            notes: item.notes,
            updated_at: timestamp,
        })),
        created_at: timestamp,
        updated_at: timestamp,
    };
}

export const planningExecutionBatchTool = defineTool(
    async ({ batch }): Promise<string> => {
        const normalizedBatch = resolveBatchFromRequest({ batch });
        const result: ExecutionBatchResultType = {
            ok: true,
            batch: normalizedBatch,
            summary: 'Execution batch planned and ready for delegation.',
        };

        return JSON.stringify(result, null, 2);
    },
    {
        name: 'planning_execution_batch',
        description:
            'Plan and normalize an execution batch before delegating it to the executioner subagent. This does not execute the work.',
        schema: ExecutionBatchRequestSchema,
    },
);

export const updateExecutionBatchTool = defineTool(
    async ({ batch }): Promise<string> => {
        const nextBatch: ExecutionBatchType = {
            ...ExecutionBatchSchema.parse(batch),
            updated_at: Date.now(),
        };
        const result: ExecutionBatchResultType = {
            ok: true,
            batch: nextBatch,
            summary: `Execution batch ${nextBatch.batch_id} updated.`,
        };

        return JSON.stringify(result, null, 2);
    },
    {
        name: 'update_execution_batch',
        description:
            'Toggle or revise the current execution batch payload as work progresses across orchestrator, executioner, or compiled summarization stages.',
        schema: ExecutionBatchRequestSchema.extend({
            batch: ExecutionBatchSchema,
        }),
    },
);