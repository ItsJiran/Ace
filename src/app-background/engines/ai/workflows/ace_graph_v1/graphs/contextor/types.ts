import { AceAgentWorkflowBaseState } from '../../types';

/** Context passed from the calling workflow to the contextor subgraph. */
export interface AceAgentContextorParent<TParentTask = unknown> {
    tasks?: TParentTask[];
    target_node?: string;
    target_node_reason?: string;
}

/** Contextor subgraph state — `parent.tasks` type varies depending on which workflow calls it. */
export interface AceAgentContextorState<TParentTask = unknown> extends AceAgentWorkflowBaseState {
    /** Parent context — tasks + routing intent from the calling workflow (orchestrator, executor, etc.). */
    parent?: AceAgentContextorParent<TParentTask>;
    /** Summary of what this subgraph has completed — set by nodes, read by supervision edge for LLM summarization. */
    result_summary: string;
    tasks: AceAgentContextorTask[];
}

export interface AceAgentContextorTask {
    id: string;
    type: 'context_retriever' | 'tool_retriever';
    summary: string;
    payload: Record<string, unknown>;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
}
