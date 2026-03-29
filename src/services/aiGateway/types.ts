export type SDKProvider = 'openai' | 'google' | 'anthropic';

export const AI_SESSION_STATUS = {
    IDLE: 'idle',
    CONNECTED: 'connected',
    STREAMING: 'streaming',
    ERROR: 'error',
} as const;

export type AISessionStatus = typeof AI_SESSION_STATUS[keyof typeof AI_SESSION_STATUS];

export const AI_BLOCK_HANDLER_STATUS = {
    IDLE: 'idle',
    RUNNING: 'running',
    PARSING: 'parsing',
    FAILED: 'failed',
} as const;

export type AIBlockHandlerStatus = typeof AI_BLOCK_HANDLER_STATUS[keyof typeof AI_BLOCK_HANDLER_STATUS];

export const AI_RESPONSE_STATUS = {
    STREAMING: 'streaming',
    RUNNING: 'running',
    COMPLETED: 'completed',
    INTERRUPTED: 'interrupted',
    ERROR: 'error',
    FAILED: 'failed',
} as const;

export type AIResponseStatus = typeof AI_RESPONSE_STATUS[keyof typeof AI_RESPONSE_STATUS];

export const AI_GATEWAY_PROCESS_TYPE = {
    SESSION: 'ai_gateway:session',
    RESPONSE_TURN: 'ai_gateway:response_turn',
    PARSER_STREAM: 'ai_gateway:parser_stream',
} as const;

export type AIGatewayProcessType = typeof AI_GATEWAY_PROCESS_TYPE[keyof typeof AI_GATEWAY_PROCESS_TYPE];

export const AI_GATEWAY_ROUTE_ACTION = {
    SEND_GATEWAY: 'send_gateway',
    PARSER_RESULT: 'parser_result',
    TOOL: 'tool',
} as const;

export const AI_GATEWAY_ROUTE_SUB_ACTION = {
    SESSION: 'session',
} as const;

export const AI_FEEDBACK_LOOP_STATUS = {
    NONE: 'none',
    ACTIVE: 'active',
    COMPLETED: 'completed',
    INTERRUPTED: 'interrupted',
} as const;

export type AIFeedbackLoopStatus = typeof AI_FEEDBACK_LOOP_STATUS[keyof typeof AI_FEEDBACK_LOOP_STATUS];

export interface AIRequestProtocolState {
    request_started_at: number;
    finished_at?: number;
    summary_paragraph_threshold: number;
    prompt_paragraph_count: number;
    response_paragraph_count: number;
    require_prompt_summary: boolean;
    require_response_summary: boolean;
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

    status: AISessionStatus;
    termination_requested?: boolean;
    activeAbortController?: AbortController;
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
        block_slug: 'history_summary_ai_prompt' | 'history_summary_ai_response';
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
    block_handler_state?: {
        status: AIBlockHandlerStatus;
        block_slug?: string;
        action?: string;
        event_name?: string;
        result_memory_uid?: string;
        updated_at?: number;
    };
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
