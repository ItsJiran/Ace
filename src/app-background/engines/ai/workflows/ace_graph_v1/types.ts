import type { BaseMessage } from '@langchain/core/messages';

/** Canonical workflow state for ace_graph_v1. */
export interface AceAgentWorkflowBaseState {
    messages: BaseMessage[];
    passed_message: string;
    context?: AceAgentWorkflowContext;

    from_node?: string;
    target_node?: string;
    target_node_reason?: string;
    iteration_loop?: number;
}

export interface AceAgentWorkflowState extends AceAgentWorkflowBaseState {
    tasks?: AceAgentWorkflowTask[];
}

export interface AceAgentWorkflowTask {
    id: string;
    type: 'orchestrator' | 'executor' | 'summarization' | 'end';
    summary: string;
    payload: Record<string, unknown>;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface AceAgentWorkflowContext {
    files?: Array<{
        path: string;
        size: number;
        line_count: number;
        last_modified: string;
        storage_memory_uid?: string;
        is_active?: boolean;
    }>;
    informations?: Array<{
        title: string;
        content: string;
        is_active?: boolean;
    }>;
    tools?: Array<{
        name: string;
        description: string;
        result_summary?: string;
        input_schema: Record<string, unknown>;
        result_schema: Record<string, unknown>;
        storage_memory_uid?: string;
        is_active?: boolean;
    }>;
    recent_node_results?: Array<{
        node_name: string;
        result_summary: string;
        is_active?: boolean;
    }>;
}
