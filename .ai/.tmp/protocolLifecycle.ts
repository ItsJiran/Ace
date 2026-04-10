import { AIContextEngine } from '../aiContextEngine';
import type { AIRequestProtocolState } from '#/schemas/ai';

export const HISTORY_SUMMARY_PARAGRAPH_THRESHOLD = 2;

export interface ProtocolHostSession {
    sessionId: string;
    currentProtocolState?: AIRequestProtocolState;
    lastProtocolState?: AIRequestProtocolState;
}

export interface HistorySummaryReference {
    storage_key: string;
    ref_uid?: string;
}

/**
 * Safety post-processor: strips any history_summary XML blocks that leaked into
 * user-visible text (for edge chunk-boundary cases).
 */
export function stripHistorySummaryBlocksFromText(text: string): string {
    const stripped = text
        .replace(/<history_summary_ai_prompt>[\s\S]*?<\/history_summary_ai_prompt>/gi, '')
        .replace(/<history_summary_ai_response>[\s\S]*?<\/history_summary_ai_response>/gi, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return stripped;
}

export function countParagraphs(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;

    return trimmed
        .split(/\n\s*\n+/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0).length;
}

export function initializeRequestProtocolState(input: {
    prompt: string;
    promptReference: HistorySummaryReference;
    responseReference: HistorySummaryReference;
    summaryParagraphThreshold?: number;
}): AIRequestProtocolState {
    const threshold = input.summaryParagraphThreshold ?? HISTORY_SUMMARY_PARAGRAPH_THRESHOLD;
    const promptParagraphCount = countParagraphs(input.prompt);
    const requirePromptSummary = promptParagraphCount >= threshold;

    return {
        request_started_at: Date.now(),
        summary_paragraph_threshold: threshold,
        prompt_paragraph_count: promptParagraphCount,
        response_paragraph_count: 0,
        require_prompt_summary: requirePromptSummary,
        require_response_summary: false,
        prompt_memory_key: input.promptReference.storage_key,
        prompt_ref_uid: input.promptReference.ref_uid,
        response_memory_key: input.responseReference.storage_key,
        response_ref_uid: input.responseReference.ref_uid,
        prompt_summary_received: false,
        prompt_summary_valid: false,
        response_summary_received: false,
        response_summary_valid: false,
        fallback_prompt_summary_used: false,
        fallback_response_summary_used: false,
        violations: [],
    };
}

export function finalizeRequestProtocolState(input: {
    session: ProtocolHostSession;
    prompt: string;
    responseText: string;
    rawResponse: string;
}): AIRequestProtocolState | null {
    const { session, prompt, responseText, rawResponse } = input;
    const protocol = session.currentProtocolState;
    if (!protocol) {
        return null;
    }

    recoverHistorySummariesFromRawResponse(session.sessionId, protocol, rawResponse);

    const responseParagraphCount = countParagraphs(responseText);
    protocol.response_paragraph_count = responseParagraphCount;
    if (!protocol.require_response_summary && responseParagraphCount >= protocol.summary_paragraph_threshold) {
        protocol.require_response_summary = true;
    }

    if (!protocol.prompt_summary_valid) {
        if (protocol.require_prompt_summary) {
            AIContextEngine.ingestRuntimeHistorySummaryFallback(session.sessionId, {
                block_slug: 'history_summary_ai_prompt',
                memory_key: protocol.prompt_memory_key,
                ref_uid: protocol.prompt_ref_uid,
                summary_source_text: prompt,
                protocol_reason: protocol.prompt_summary_received ? 'invalid_block' : 'missing_block',
            });
            protocol.fallback_prompt_summary_used = true;
            if (!protocol.prompt_summary_received) {
                protocol.violations.push('Missing required history_summary_ai_prompt block.');
            }
        } else {
            AIContextEngine.ingestRawHistorySummary(session.sessionId, {
                block_slug: 'history_summary_ai_prompt',
                memory_key: protocol.prompt_memory_key,
                ref_uid: protocol.prompt_ref_uid,
                text: prompt,
            });
        }
    }

    if (!protocol.response_summary_valid && responseText.trim().length > 0) {
        if (protocol.require_response_summary) {
            AIContextEngine.ingestRuntimeHistorySummaryFallback(session.sessionId, {
                block_slug: 'history_summary_ai_response',
                memory_key: protocol.response_memory_key,
                ref_uid: protocol.response_ref_uid,
                summary_source_text: responseText,
                protocol_reason: protocol.response_summary_received ? 'invalid_block' : 'missing_block',
            });
            protocol.fallback_response_summary_used = true;
            if (!protocol.response_summary_received) {
                protocol.violations.push('Missing required history_summary_ai_response block.');
            }
        } else {
            AIContextEngine.ingestRawHistorySummary(session.sessionId, {
                block_slug: 'history_summary_ai_response',
                memory_key: protocol.response_memory_key,
                ref_uid: protocol.response_ref_uid,
                text: responseText,
            });
        }
    }

    protocol.finished_at = Date.now();
    session.lastProtocolState = { ...protocol, violations: [...protocol.violations] };
    session.currentProtocolState = undefined;
    return session.lastProtocolState;
}

function recoverHistorySummariesFromRawResponse(
    sessionId: string,
    protocol: AIRequestProtocolState,
    rawResponse: string,
): void {
    if (!rawResponse || rawResponse.trim().length === 0) return;

    recoverHistorySummaryFromRawBlock(sessionId, protocol, rawResponse, 'history_summary_ai_prompt');
    recoverHistorySummaryFromRawBlock(sessionId, protocol, rawResponse, 'history_summary_ai_response');
}

function recoverHistorySummaryFromRawBlock(
    sessionId: string,
    protocol: AIRequestProtocolState,
    rawResponse: string,
    blockType: 'history_summary_ai_prompt' | 'history_summary_ai_response',
): void {
    const alreadyValid = blockType === 'history_summary_ai_prompt'
        ? protocol.prompt_summary_valid
        : protocol.response_summary_valid;
    if (alreadyValid) return;

    const payloadCandidates = extractStructuredBlockPayloads(rawResponse, blockType);
    if (payloadCandidates.length === 0) return;

    const expectedKey = blockType === 'history_summary_ai_prompt'
        ? protocol.prompt_memory_key
        : protocol.response_memory_key;
    const expectedRefUid = blockType === 'history_summary_ai_prompt'
        ? protocol.prompt_ref_uid
        : protocol.response_ref_uid;

    let recoveredPayload: Record<string, unknown> | null = null;
    for (const payloadRaw of payloadCandidates) {
        const payload = parseBlockPayloadObject(payloadRaw);
        if (!payload) continue;

        const memoryKey = readHistorySummaryMemoryKey(payload);
        const refUid = readHistorySummaryRefUid(payload);
        const isValid = memoryKey === expectedKey && (!expectedRefUid || refUid === expectedRefUid);
        if (!isValid) continue;

        recoveredPayload = payload;
        break;
    }

    if (!recoveredPayload) return;

    AIContextEngine.ingestHistorySummaryBlock(sessionId, blockType, recoveredPayload);

    if (blockType === 'history_summary_ai_prompt') {
        protocol.prompt_summary_received = true;
        protocol.prompt_summary_valid = true;
        protocol.fallback_prompt_summary_used = false;
        return;
    }

    protocol.response_summary_received = true;
    protocol.response_summary_valid = true;
    protocol.fallback_response_summary_used = false;
}

function parseBlockPayloadObject(payloadRaw: string): Record<string, unknown> | null {
    try {
        const parsed = JSON.parse(payloadRaw) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }
        return null;
    } catch {
        return null;
    }
}

function extractStructuredBlockPayloads(
    rawResponse: string,
    blockType: 'history_summary_ai_prompt' | 'history_summary_ai_response',
): string[] {
    const source = rawResponse;
    const lower = source.toLowerCase();
    const open = `<${blockType}>`;
    const close = `</${blockType}>`;

    let cursor = 0;
    const payloads: string[] = [];

    while (cursor < lower.length) {
        const openIndex = lower.indexOf(open, cursor);
        if (openIndex === -1) break;
        const bodyStart = openIndex + open.length;
        const closeIndex = lower.indexOf(close, bodyStart);
        if (closeIndex === -1) break;

        payloads.push(source.slice(bodyStart, closeIndex).trim());
        cursor = closeIndex + close.length;
    }

    return payloads;
}

function readHistorySummaryMemoryKey(payload: Record<string, unknown>): string | null {
    const candidate = payload.memory_key ?? payload.memory_uid ?? payload.ram_key_id ?? payload.storage_key;
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

function readHistorySummaryRefUid(payload: Record<string, unknown>): string | undefined {
    const candidate = payload.ref_uid ?? payload.reference_uid;
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : undefined;
}