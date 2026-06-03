import { AceAgentWorkflowBaseSubgraphsState, AceAgentWorkflowTask } from '../../types';

// ── Parent context ─────────────────────────────────────────────────────────

/** Context passed from the calling workflow to the thought subgraph. */
export interface AceAgentThoughtParent {
    /** Parent's task list (could be orchestrator or executor tasks). */
    tasks?: AceAgentWorkflowTask[];
    /** Parent's accumulated thoughts — the thought subgraph can reflect on these. */
    thoughts?: AceAgentThoughtEntry[];
    target_node?: string;
    target_node_reason?: string;
}

// ── State ──────────────────────────────────────────────────────────────────

/** Thought subgraph state. */
export interface AceAgentThoughtState extends AceAgentWorkflowBaseSubgraphsState {
    /** Parent context — tasks + thoughts from the calling workflow. */
    parent?: AceAgentThoughtParent;
    /** Summary of what this subgraph has completed. */
    result_summary: string;
    /** Tasks to execute within this subgraph. */
    tasks: AceAgentThoughtTask[];
    /** Accumulated reasoning — like messages but for internal thought process. */
    thoughts: AceAgentThoughtEntry[];
}

// ── Tasks ──────────────────────────────────────────────────────────────────

export interface AceAgentThoughtTask {
    id: string;
    type: 'analyze' | 'reflect' | 'critique' | 'synthesize' | '__end__';
    summary: string;
    payload: Record<string, unknown>;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

// ── Thought entries ────────────────────────────────────────────────────────

/**
 * A single entry in the thought chain — like a message but scoped to
 * internal reasoning rather than conversation history.
 */
export interface AceAgentThoughtEntry {
    /** Unique identifier for this thought. */
    id: string;
    /** The reasoning content. */
    content: string;
    /** Which node or subgraph produced this thought (e.g. `thought-analyze`). */
    name: string;
    /** What this thought is about — a task id, a parent thought id, or general. */
    about?: string;
    /** Confidence in this reasoning. */
    confidence?: 'low' | 'medium' | 'high';
    /** When this thought was created. */
    timestamp: string;
}
