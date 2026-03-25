export type SDKProvider = 'openai' | 'google' | 'anthropic';

export interface AIRequestProtocolState {
    request_started_at: number;
    finished_at?: number;
    prompt_memory_key: string;
    prompt_ref_uid?: string;
    response_memory_key: string;
    response_ref_uid?: string;
    prompt_summary_received: boolean;
    prompt_summary_valid: boolean;
    response_summary_received: boolean;
    response_summary_valid: boolean;
    fallback_prompt_summary_used: boolean;
    fallback_response_summary_used: boolean;
    violations: string[];
}

/**
 * A live session bound to a specific SDK + model combination.
 * Multiple sessions can run concurrently, each with independent stream buffers.
 */
export interface AISession {
    sessionId: string;
    sdk: SDKProvider;
    model: string;

    /** The RAM key currently being streamed into */
    activeOutputRamKey?: string;

    /** Carryover buffer for partial event blocks that span chunk boundaries */
    activeEventBuffer: string;
    isInsideEventBlock: boolean;
    currentProtocolState?: AIRequestProtocolState;
    lastProtocolState?: AIRequestProtocolState;

    status: 'idle' | 'connected' | 'streaming' | 'error';
}

/** Read-only session shape for UI monitoring/debug panels. */
export interface AISessionSnapshot {
    sessionId: string;
    sdk: SDKProvider;
    model: string;
    status: AISession['status'];
    activeOutputRamKey?: string;
    isInsideEventBlock: boolean;
    activeEventBufferLength: number;
    summary?: string;
    turns?: Array<{ at: number; role: 'user' | 'assistant' | 'system'; text: string }>;
    history_summaries?: Array<{
        at: number;
        block_type: 'history_summary_ai_prompt' | 'history_summary_ai_response';
        summary: string;
        memory_key?: string;
        ref_uid?: string;
        payload: Record<string, unknown>;
    }>;
    context_blocks?: Array<{ at: number; payload: Record<string, unknown> }>;
    used_contexts?: Array<{
        key: string;
        label: string;
        kind: string;
        detail?: string;
        token_estimate?: number;
    }>;
    context_updated_at?: number;
    protocol_state?: AIRequestProtocolState;
}

/** A single parsed event block from an AI stream chunk */
export interface ParsedBatchEvent {
    headers: {
        event_type: string;
        window_uid: string;
        process_uid?: string;
        widget_uid?: string;
        action: string;
        sub_action?: string;
    };
    raw_payload_buffer: string;
    is_complete: boolean;
    payload_json: Record<string, unknown> | null;
    payload_parse_error?: string;
}

/** One chunk's worth of parsed output stored in RAM */
export interface ParserBatchRecord {
    batch_index: number;
    received_at: number;
    raw_chunk: string;
    text_to_print: string;
    events: ParsedBatchEvent[];
    has_carryover_buffer: boolean;
}
