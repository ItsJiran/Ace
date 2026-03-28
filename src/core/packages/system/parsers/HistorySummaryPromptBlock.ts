import type { AceRegistryType } from '#/schemas/registryTypes';
import type { BaseBlock, ParserBlockHandler, ParserBlockValidator } from '#/schemas/parser';

type HistorySummaryPromptType = 'history_summary_ai_prompt';

export interface HistorySummaryPromptParserBlock extends BaseBlock {
    block_slug: HistorySummaryPromptType;
}

export const validator: ParserBlockValidator = ({ isComplete, payload_json, payload_parse_error }) => {
    if (!isComplete) return;
    if (!payload_json) {
        throw new Error(payload_parse_error || 'history_summary_ai_prompt requires a valid JSON payload');
    }

    return normalizeHistorySummaryPayload(payload_json, '', 'history_summary_ai_prompt') ?? payload_json;
};

function normalizeHistorySummaryPayload(
    payload: Record<string, unknown> | null,
    rawBody: string,
    blockType: HistorySummaryPromptType,
): Record<string, unknown> | null {
    if (!payload) {
        const fallback = rawBody.trim();
        return fallback ? { type: blockType, summary: fallback } : null;
    }

    const normalized: Record<string, unknown> = { ...payload };
    if (typeof normalized.type !== 'string') normalized.type = blockType;
    if (typeof normalized.memory_key !== 'string') {
        const memoryKey = payload.memory_uid ?? payload.ram_key_id ?? payload.storage_key;
        if (typeof memoryKey === 'string' && memoryKey.trim().length > 0) {
            normalized.memory_key = memoryKey.trim();
        }
    }
    if (typeof normalized.ref_uid !== 'string') {
        const refUid = payload.reference_uid;
        if (typeof refUid === 'string' && refUid.trim().length > 0) {
            normalized.ref_uid = refUid.trim();
        }
    }
    if (typeof normalized.summary !== 'string') {
        if (typeof normalized.text === 'string') normalized.summary = normalized.text;
        else if (typeof normalized.content === 'string') normalized.summary = normalized.content;
    }

    return normalized;
}

export const registry: AceRegistryType.Parser = {
    name: 'history_summary_ai_prompt',
    slug: 'history_summary_ai_prompt',
    description: 'Compact summary of the current user prompt.',
    block_schema: {
        purpose: 'Compact summary of the current user message. Emit BEFORE your prose response.',
        requiredFields: '"summary" (string), "memory_key" (exact value from TURN_HISTORY_PROTOCOL section), "ref_uid" (exact value from TURN_HISTORY_PROTOCOL section).',
        triggerConditions: [
            'Before producing the main AI response, summarize the current user turn',
            'Captures the essence of what the user asked in this turn for history tracking',
            'Always emitted at the start of AI response to maintain conversation history',
            'Used to build conversational context for future turns in the session',
        ],
        promptExamples: [
            'Summarize what the user just asked me in one sentence',
            'Capture the key intent of the user message for the turn history',
            'Create a brief summary of the current user request before responding',
            'Document the user\'s request in the conversation turn history',
        ],
        exampleLines: [
            '  <history_summary_ai_prompt>',
            '  {"summary":"User meminta pembuatan file catatan baru bernama todo.txt.","memory_key":"system:ai_context_rag:payload:ctxref-prompt","ref_uid":"ref-abc123"}',
            '  </history_summary_ai_prompt>',
        ],
    },
};

export const handler: ParserBlockHandler = ({ body, payload_json, payload_parse_error, isComplete, result }) => {
    const blockType: HistorySummaryPromptType = 'history_summary_ai_prompt';
    result.blocks.push({
        block_slug: blockType,
        payload_raw: body,
        payload_json,
        payload_parse_error,
        is_complete: isComplete,
    });
};
