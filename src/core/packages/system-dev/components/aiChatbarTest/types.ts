export type SDKProvider = 'openai' | 'google' | 'anthropic';
export type ChatRole = 'user' | 'assistant';

export interface GatewayModel {
    id: string;
    name?: string;
}

export interface GatewayConfig {
    active_sdk: SDKProvider | null;
    active_model: string | null;
    sdks: Partial<Record<SDKProvider, { api_key: string; models: GatewayModel[] }>>;
}

export interface ParserBatchMemory {
    prompt?: string;
    text?: string;
    raw_response?: string;
    blocks?: Array<
        | { type: 'paragraph'; content: string }
        | { type: 'context'; payload_raw: string; payload_json: Record<string, unknown> | null; is_complete: boolean }
        | { type: 'history_summary_ai_prompt' | 'history_summary_ai_response'; payload_raw: string; payload_json: Record<string, unknown> | null; is_complete: boolean }
        | { type: 'presentation'; payload_raw: string; payload_json: Record<string, unknown> | null; is_complete: boolean; package_ref?: string; component_slug: string; memory_key?: string; props?: Record<string, unknown>; format?: string }
        | { type: 'tool' | 'storage'; payload_raw: string; payload_json: Record<string, unknown> | null; status: string; is_complete: boolean; action?: string; memory_uid?: string; result_memory_uid?: string }
        | { type: 'event'; event: { headers: Record<string, unknown>; raw_payload_buffer: string; is_complete: boolean } }
        | { type: 'directive'; directive_name: string; content: string; is_complete: boolean }
    >;
    parser_handler_results?: Array<{
        session_id: string;
        tag: string;
        at: number;
        event_name?: string;
        interrupt_hint?: boolean;
        payload: Record<string, unknown>;
    }>;
    parser_batches?: unknown[];
    parser_batch_count?: number;
    events_total?: number;
    status?: string;
    error_message?: string;
}

export interface ChatMessage {
    id: string;
    role: ChatRole;
    content: string;
    turnId: string;
    status?: string;
    parserBatchCount?: number;
    eventsTotal?: number;
}
