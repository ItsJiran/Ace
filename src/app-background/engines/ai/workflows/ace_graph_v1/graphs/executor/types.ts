import type { BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { AceAgentWorkflowState } from '../../types';

/** Executor subgraph state. */
export interface AceAgentExecutorState extends AceAgentWorkflowState {
    messages: BaseMessage[];
}

export interface AceAgentExecutorTask {
    id: string;
    type: 'tool' | 'contextor';
    summary: string;
    payload: Record<string, unknown>;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

/** Schema for executor's return to parent workflow. */
export const AceAgentExecutorReturnSchema = z.object({
    context_update: z.object({
        files: z.array(z.object({
            path: z.string(), size: z.number(), line_count: z.number(),
            last_modified: z.string(), storage_memory_uid: z.string().optional(), is_active: z.boolean().optional(),
        })).optional(),
        tools: z.array(z.object({
            name: z.string(), description: z.string(), result_summary: z.string().optional(),
            input_schema: z.record(z.string(),z.any()), result_schema: z.record(z.string(),z.any()),
            storage_memory_uid: z.string().optional(), is_active: z.boolean().optional(),
        })).optional(),
    }).describe('Context delta from tool execution.'),
    result_summary: z.string().describe('Summary for recent_node_results.'),
});

export type AceAgentExecutorReturnType = z.infer<typeof AceAgentExecutorReturnSchema>;
