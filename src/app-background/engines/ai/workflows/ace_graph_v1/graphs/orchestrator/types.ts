import type { BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';

/** Orchestrator subgraph state. */
export interface AceAgentOrchestratorState {
    messages: BaseMessage[];
    original_prompt: string;
    tasks: AceAgentOrchestratorTask[];
    context?: any;
    from_node?: string;
    target_node?: string;
    target_node_reason?: string;
    iteration_loop?: number;
}

export interface AceAgentOrchestratorTask {
    id: string;
    type: 'planner' | 'contextor' | 'supervisor';
    summary: string;
    payload: Record<string, unknown>;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

/** Schema for orchestrator's return to parent workflow. */
export const AceAgentOrchestratorReturnSchema = z.object({
    tasks: z.array(z.object({
        id: z.string(),
        type: z.enum(['orchestrator', 'executor', 'contextor', 'summarization', '__end__']),
        summary: z.string(), payload: z.record(z.unknown()),
        status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
    })),
    result_summary: z.string().describe('Summary for recent_node_results.'),
});

export type AceAgentOrchestratorReturnType = z.infer<typeof AceAgentOrchestratorReturnSchema>;
