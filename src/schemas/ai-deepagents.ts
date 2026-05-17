import type { AIContextEntry, AIPlanEntry, AILongTermStorageConfig, AISessionState, SDKProvider } from './ai';

export type AIDeepAgentPromptKind = 'user_prompt' | 'autonomous_follow_up';

export interface AIDeepAgentToolDescriptor {
    kind?: string;
    slug: string;
    name: string;
    description: string;
    package_ref: string;
    parameters?: Record<string, unknown>;
}

export interface AIDeepAgentBackendState {
    thread_id: string;
    session_uid: string;
    provider?: SDKProvider;
    model?: string;
    active_agent?: string;
    plan: AIPlanEntry[];
    context: AIContextEntry[];
    context_records: AIContextEntry[];
    long_term_storage: AILongTermStorageConfig;
    mirrored_ace_tools: AIDeepAgentToolDescriptor[];
    known_ace_tools: AIDeepAgentToolDescriptor[];
}

export interface CreateDeepAgentRequestPayload {
    thread_id: string;
    session_uid: string;
    model?: string;
    prompt: string;
    prompt_kind: AIDeepAgentPromptKind;
    ace_tools: AIDeepAgentToolDescriptor[];
    context_records: AIContextEntry[];
    backend_state: AIDeepAgentBackendState;
}

export interface AIDeepAgentToolIntent {
    request_id: string;
    package_ref: string;
    tool_slug: string;
    payload: Record<string, unknown>;
    reason?: string;
}

export interface AIDeepAgentToolResult {
    status: 'ok' | 'error';
    action: 'execute';
    request_id: string;
    package_ref: string;
    tool_slug: string;
    result_memory_uid?: string | null;
    result?: unknown;
    error_message?: string;
}

export interface AIDeepAgentRuntimeSnapshot {
    type?: string;
    event_type?: string;
    action?: string;
    status?: string;
    session_state?: AISessionState | string;
    active_step?: string;
    response_step?: string;
    step_path?: unknown;
    state_path?: unknown;
    planning?: unknown;
    todo_items?: unknown;
    context?: unknown;
    memory?: unknown;
    active_agent?: unknown;
    context_records?: unknown;
    payload?: unknown;
    emitted_at?: number;
    event_index?: number;
}