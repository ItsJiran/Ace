import { AceAgentWorkflowBaseSubgraphsState, AceAgentWorkflowTask } from '../../types';

/** Context passed from the parent workflow to this subgraph. */
export interface AceAgentOrchestratorParent {
    tasks?: AceAgentWorkflowTask[];
    target_node?: string;
    target_node_reason?: string;
}

/** Orchestrator subgraph state. */
export interface AceAgentOrchestratorState extends AceAgentWorkflowBaseSubgraphsState {
    /** Parent context — tasks + routing intent from the calling workflow. */
    parent?: AceAgentOrchestratorParent;
    /** Summary of what this subgraph has completed — set by nodes, read by supervision edge for LLM summarization. */
    result_summary: string;
    tasks: AceAgentOrchestratorTask[];
}

export interface AceAgentOrchestratorTask {
    id: string;
    type: 'planner' | 'contextor' | 'thought' | 'orchestrator' | '__end__';
    summary: string;
    payload: Record<string, unknown>;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
}
