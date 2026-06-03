import type { BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { AceAgentWorkflowBaseSubgraphsState, AceAgentWorkflowTask } from '../../types';

/** Orchestrator subgraph state. */
export interface AceAgentOrchestratorState extends AceAgentWorkflowBaseSubgraphsState {
    /** The parent workflow task that triggered this subgraph invocation. */
    parent_task?: AceAgentWorkflowTask;
    tasks: AceAgentOrchestratorTask[];
}

export interface AceAgentOrchestratorTask {
    id: string;
    type: 'planner' | 'contextor' | 'thought' | 'orchestrator' | '__end__';
    summary: string;
    payload: Record<string, unknown>;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

/** Schema for orchestrator's return to parent workflow. */
export const AceAgentOrchestratorReturnSchema = z.object({
    tasks: z.array(z.object({
        id: z.string(),
        type: z.enum(['planner', 'contextor', 'thought', 'orchestrator', '__end__']),
        summary: z.string(), payload: z.record(z.string(),z.any()),
        status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
    })),
    result_summary: z.string().describe('Summary for recent_node_results.'),
});

export type AceAgentOrchestratorReturnType = z.infer<typeof AceAgentOrchestratorReturnSchema>;
