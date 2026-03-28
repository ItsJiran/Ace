export interface SessionContextRef {
    key: string;
    label: string;
    kind: 'summary' | 'history' | 'runtime' | 'tooling' | 'input';
    detail?: string;
    token_estimate?: number;
}

export interface SessionTurn {
    at: number;
    role: 'user' | 'assistant' | 'system';
    text: string;
}

export interface SessionHistorySummary {
    at: number;
    block_slug: 'history_summary_ai_prompt' | 'history_summary_ai_response';
    source: 'ai_parsed' | 'raw' | 'fallback';
    summary: string;
    memory_key?: string;
    ref_uid?: string;
    payload: Record<string, unknown>;
}

export interface SessionContextState {
    session_id: string;
    attached_at: number;
    updated_at: number;
    summary: string;
    turns: SessionTurn[];
    history_summaries: SessionHistorySummary[];
    used_contexts: SessionContextRef[];
    context_blocks: Array<{
        at: number;
        payload: Record<string, unknown>;
    }>;
}

export interface BuildContextOptions {
    sdk?: string;
    model?: string;
    summaryParagraphThreshold?: number;
    requirePromptHistorySummary?: boolean;
    requireResponseHistorySummary?: boolean;
    promptHistoryMemoryKey?: string;
    promptHistoryRefUid?: string;
    responseHistoryMemoryKey?: string;
    responseHistoryRefUid?: string;
}

export interface RuntimeHistorySummaryFallbackInput {
    block_slug: SessionHistorySummary['block_slug'];
    memory_key: string;
    ref_uid?: string;
    summary_source_text: string;
    protocol_reason: 'missing_block' | 'invalid_block';
}