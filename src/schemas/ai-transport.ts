export type AIRequestExchangeLifecycle = 'pending' | 'streaming' | 'completed' | 'failed' | 'aborted';

export interface AIRequestMetrics {
    at: number;
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
}

export interface AIResponseMetrics {
    at?: number;
    first_chunk_at?: number;
    completed_at?: number;
    status?: number;
    status_text?: string;
    ok?: boolean;
    headers?: Record<string, string>;
    body_preview?: string;
    streamed_chunk_count?: number;
    streamed_char_count?: number;
    duration_ms?: number;
    lifecycle?: AIRequestExchangeLifecycle;
    error_message?: string;
}

export interface AIRequestExchangeMiddlewareMetrics {
    middleware_name?: string;
    provider?: string;
    model?: string;
    request_id?: string;
}

export interface AIRequestExchangeMetrics {
    middleware?: AIRequestExchangeMiddlewareMetrics;
    request?: AIRequestMetrics;
    response?: AIResponseMetrics;
}

export type AINetworkTrace = AIRequestExchangeMetrics;
export type AINetworkRequestTrace = AIRequestMetrics;
export type AINetworkResponseTrace = AIResponseMetrics;