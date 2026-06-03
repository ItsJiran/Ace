import { AceAgentWorkflowBaseSubgraphsState, AceAgentWorkflowTask } from '../../types';

/** Context passed from the parent workflow to this subgraph. */
export interface AceAgentExecutorParent {
    tasks?: AceAgentWorkflowTask[];
    target_node?: string;
    target_node_reason?: string;
}

/** Executor subgraph state. */
export interface AceAgentExecutorState extends AceAgentWorkflowBaseSubgraphsState {
    /** Parent context — tasks + routing intent from the calling workflow. */
    parent?: AceAgentExecutorParent;
    /** Summary of what this subgraph has completed — set by nodes, read by supervision edge for LLM summarization. */
    result_summary: string;
    tasks: AceAgentExecutorTask[];
}

export interface AceAgentExecutorTask {
    id: string;
    type: 'tool' | 'contextor';
    summary: string;
    payload: Record<string, unknown>;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
}
