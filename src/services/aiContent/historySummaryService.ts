import type { RuntimeHistorySummaryFallbackInput, SessionContextRef, SessionContextState, SessionHistorySummary } from './types';

function extractHistorySummaryText(payload: Record<string, unknown>): string {
    const directSummary = typeof payload.summary === 'string' ? payload.summary.trim() : '';
    if (directSummary.length > 0) {
        return directSummary.slice(0, 500);
    }

    const textField = typeof payload.text === 'string' ? payload.text.trim() : '';
    if (textField.length > 0) {
        return textField.slice(0, 500);
    }

    const contentField = typeof payload.content === 'string' ? payload.content.trim() : '';
    if (contentField.length > 0) {
        return contentField.slice(0, 500);
    }

    return JSON.stringify(payload).slice(0, 500);
}

function extractHistoryMemoryKey(payload: Record<string, unknown>): string | undefined {
    const candidate = payload.memory_key ?? payload.memory_uid ?? payload.ram_key_id ?? payload.storage_key;
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : undefined;
}

function extractHistoryRefUid(payload: Record<string, unknown>): string | undefined {
    const candidate = payload.ref_uid ?? payload.reference_uid;
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : undefined;
}

function buildRuntimeFallbackSummary(text: string, blockType: SessionHistorySummary['block_type']): string {
    const trimmed = text.trim().replace(/\s+/g, ' ');
    if (!trimmed) {
        return blockType === 'history_summary_ai_prompt'
            ? 'Runtime fallback: user prompt summary unavailable.'
            : 'Runtime fallback: assistant response summary unavailable.';
    }

    const prefix = blockType === 'history_summary_ai_prompt'
        ? 'Runtime fallback prompt summary: '
        : 'Runtime fallback response summary: ';

    return `${prefix}${trimmed.slice(0, 280)}`;
}

export function ingestHistorySummaryToState(input: {
    state: SessionContextState;
    blockType: SessionHistorySummary['block_type'];
    payload: Record<string, unknown>;
    maxHistorySummaries: number;
}): SessionContextState {
    const { state, blockType, payload, maxHistorySummaries } = input;
    const now = Date.now();
    const summaryText = extractHistorySummaryText(payload);
    const memoryKey = extractHistoryMemoryKey(payload);
    const refUid = extractHistoryRefUid(payload);

    const rawSource = payload.source;
    const source: SessionHistorySummary['source'] =
        rawSource === 'raw' || rawSource === 'fallback' ? rawSource : 'ai_parsed';

    const nextEntry: SessionHistorySummary = {
        at: now,
        block_type: blockType,
        source,
        summary: summaryText,
        memory_key: memoryKey,
        ref_uid: refUid,
        payload,
    };

    const existingIndex = state.history_summaries.findIndex((item) => {
        if (item.block_type !== blockType) return false;
        if (memoryKey && item.memory_key === memoryKey) return true;
        if (refUid && item.ref_uid === refUid) return true;
        return false;
    });

    if (existingIndex >= 0) {
        state.history_summaries[existingIndex] = nextEntry;
    } else {
        state.history_summaries.push(nextEntry);
    }

    if (state.history_summaries.length > maxHistorySummaries) {
        state.history_summaries = state.history_summaries.slice(-maxHistorySummaries);
    }

    const detailParts = [refUid, memoryKey].filter(Boolean);
    const nextContexts: SessionContextRef[] = [
        {
            key: memoryKey || `session:${blockType}:${now}`,
            label: blockType === 'history_summary_ai_prompt' ? 'AI prompt history summary' : 'AI response history summary',
            kind: 'history',
            detail: detailParts.length > 0 ? detailParts.join(' | ') : undefined,
            token_estimate: Math.ceil(summaryText.length / 4),
        },
    ];

    state.used_contexts = [
        ...nextContexts,
        ...state.used_contexts.slice(0, 11),
    ];

    state.updated_at = now;
    return state;
}

export function buildFallbackHistorySummaryPayload(input: RuntimeHistorySummaryFallbackInput): Record<string, unknown> {
    const summary = buildRuntimeFallbackSummary(input.summary_source_text, input.block_type);
    return {
        type: input.block_type,
        summary,
        memory_key: input.memory_key,
        ref_uid: input.ref_uid,
        source: 'fallback',
        protocol_reason: input.protocol_reason,
    };
}

export function buildRawHistorySummaryPayload(input: {
    block_type: SessionHistorySummary['block_type'];
    memory_key: string;
    ref_uid?: string;
    text: string;
}): Record<string, unknown> {
    const truncated = input.text.trim().replace(/\s+/g, ' ').slice(0, 300);
    const summary = truncated || (input.block_type === 'history_summary_ai_prompt' ? '[empty prompt]' : '[empty response]');
    return {
        type: input.block_type,
        summary,
        memory_key: input.memory_key,
        ref_uid: input.ref_uid,
        source: 'raw',
    };
}