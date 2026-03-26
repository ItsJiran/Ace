import { AIContextRagEngine } from '../aiContextRagEngine';
import type { SessionContextRef, SessionContextState } from './types';

function extractSummaryFromContextPayload(payload: Record<string, unknown>): string | null {
    const directSummary = typeof payload.summary === 'string' ? payload.summary.trim() : '';
    if (directSummary.length > 0) {
        return directSummary.slice(0, 700);
    }

    const contextSummary = typeof payload.context_summary === 'string' ? payload.context_summary.trim() : '';
    if (contextSummary.length > 0) {
        return contextSummary.slice(0, 700);
    }

    const kind = typeof payload.kind === 'string' ? payload.kind.trim().toLowerCase() : '';
    const type = typeof payload.type === 'string' ? payload.type.trim().toLowerCase() : '';
    const isSummaryUpdate = kind === 'summary_update' || type === 'summary_update';
    if (!isSummaryUpdate) {
        return null;
    }

    const textField = typeof payload.text === 'string' ? payload.text.trim() : '';
    if (textField.length > 0) {
        return textField.slice(0, 700);
    }

    const replacementField = typeof payload.replace_summary === 'string' ? payload.replace_summary.trim() : '';
    if (replacementField.length > 0) {
        return replacementField.slice(0, 700);
    }

    return null;
}

export function ingestContextBlockToState(input: {
    state: SessionContextState;
    sessionId: string;
    payload: Record<string, unknown>;
    maxContextBlocks: number;
}): SessionContextState {
    const { state, sessionId, payload, maxContextBlocks } = input;
    const now = Date.now();

    state.context_blocks.push({
        at: now,
        payload,
    });

    if (state.context_blocks.length > maxContextBlocks) {
        state.context_blocks = state.context_blocks.slice(-maxContextBlocks);
    }

    const summaryFromBlock = extractSummaryFromContextPayload(payload);
    if (summaryFromBlock) {
        state.summary = summaryFromBlock;
    }

    const nextContexts: SessionContextRef[] = [];
    nextContexts.push({
        key: `session:ai_context_block:${now}`,
        label: 'AI context block',
        kind: 'summary',
        token_estimate: Math.ceil(JSON.stringify(payload).length / 4),
    });

    const payloadText = JSON.stringify(payload);
    if (payloadText.length > 900) {
        const reference = AIContextRagEngine.createReference({
            type: 'context_block',
            title: 'AI context block',
            summary: typeof payload.summary === 'string' ? payload.summary.slice(0, 200) : 'Context block snapshot',
            source_session: sessionId,
            tags: ['context', 'ai_parser'],
            token_estimate: Math.ceil(payloadText.length / 4),
            payload,
        });

        nextContexts.push({
            key: reference.storage_key,
            label: 'RAG reference: context block',
            kind: 'tooling',
            detail: reference.ref_uid,
            token_estimate: reference.token_estimate,
        });
    }

    if (typeof payload.intent === 'string' && payload.intent.trim().length > 0) {
        nextContexts.push({
            key: 'session:intent',
            label: 'Session intent',
            kind: 'summary',
            detail: payload.intent,
            token_estimate: Math.ceil(payload.intent.length / 4),
        });
    }

    if (summaryFromBlock) {
        nextContexts.push({
            key: 'session:summary',
            label: 'AI-authored session summary',
            kind: 'summary',
            detail: 'replaced from context block',
            token_estimate: Math.ceil(summaryFromBlock.length / 4),
        });
    }

    state.used_contexts = [
        ...nextContexts,
        ...state.used_contexts
            .filter((ctx) => ctx.key !== 'session:intent' && ctx.key !== 'session:summary')
            .slice(0, 8),
    ];

    state.updated_at = Date.now();
    return state;
}