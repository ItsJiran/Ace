import type { BaseBlock } from '#/schemas/parser';

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
    blocks?: BaseBlock[];
    parser_handler_results?: Array<{
        session_id: string;
        parsed_tag: string;
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
