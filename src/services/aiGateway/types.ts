export type SDKProvider = 'openai' | 'google' | 'anthropic';

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
