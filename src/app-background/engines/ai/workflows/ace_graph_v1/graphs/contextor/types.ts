import type { BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { AceAgentWorkflowBaseState, AceAgentWorkflowContext } from '../../types';

/** Contextor subgraph state. */
export interface AceAgentContextorState extends AceAgentWorkflowBaseState {
    tasks: AceAgentContextorTask[];
}

export interface AceAgentContextorTask {
    id: string;
    type: 'context_retriever' | 'tool_retriever';
    summary: string;
    payload: Record<string, unknown>;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

/** Schema for contextor's return to parent workflow. */
export const AceAgentContextorReturnSchema = z.object({
    context_update: z
        .object({
            files: z
                .array(
                    z.object({
                        path: z.string(),
                        size: z.number(),
                        line_count: z.number(),
                        last_modified: z.string(),
                        storage_memory_uid: z.string().optional(),
                        is_active: z.boolean().optional(),
                    }),
                )
                .optional(),
            informations: z
                .array(
                    z.object({
                        title: z.string(),
                        content: z.string(),
                        is_active: z.boolean().optional(),
                    }),
                )
                .optional(),
            tools: z
                .array(
                    z.object({
                        name: z.string(),
                        description: z.string(),
                        result_summary: z.string().optional(),
                        input_schema: z.record(z.string(), z.unknown()),
                        result_schema: z.record(z.string(), z.unknown()),
                        storage_memory_uid: z.string().optional(),
                        is_active: z.boolean().optional(),
                    }),
                )
                .optional(),
        })
        .describe('Context delta to merge into parent workflow.'),
    result_summary: z.string().describe('Summary for recent_node_results.'),
});

export type AceAgentContextorReturnType = z.infer<typeof AceAgentContextorReturnSchema>;
