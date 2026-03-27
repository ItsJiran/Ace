import type { AceRegistryType } from '#/schemas/registryTypes';
import type { BaseBlock, ParserBlockHandler, ParserBlockValidator } from '#/schemas/parser';

type HistorySummaryResponseType = 'history_summary_ai_response';

export interface HistorySummaryResponseParserBlock extends BaseBlock {
    type: HistorySummaryResponseType;
}

export const validator: ParserBlockValidator = ({ isComplete, payload_json, payload_parse_error }) => {
    if (!isComplete) return;
    if (!payload_json) {
        throw new Error(payload_parse_error || 'history_summary_ai_response requires a valid JSON payload');
    }

    return normalizeHistorySummaryPayload(payload_json, '', 'history_summary_ai_response') ?? payload_json;
};

function normalizeHistorySummaryPayload(
    payload: Record<string, unknown> | null,
    rawBody: string,
    blockType: HistorySummaryResponseType,
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
    name: 'history_summary_ai_response',
    slug: 'history_summary_ai_response',
    tag_name: 'history_summary_ai_response',
    description: 'Compact summary of the current assistant response.',
    block_schema: {
        purpose: 'Compact summary of your current response. Emit AFTER your prose response is fully written.',
        requiredFields: '"summary" (string), "memory_key" (exact value from TURN_HISTORY_PROTOCOL section), "ref_uid" (exact value from TURN_HISTORY_PROTOCOL section).',
        exampleLines: [
            '  <history_summary_ai_response>',
            '  {"summary":"Saya membuat file catatan todo.txt dan menjelaskan langkah selanjutnya.","memory_key":"system:ai_context_rag:payload:ctxref-response","ref_uid":"ref-def456"}',
            '  </history_summary_ai_response>',
        ],
    },
};

export const handler: ParserBlockHandler = ({ body, payload_json, payload_parse_error, isComplete, result }) => {
    const blockType: HistorySummaryResponseType = 'history_summary_ai_response';
    result.blocks.push({
        type: blockType,
        payload_raw: body,
        payload_json,
        payload_parse_error,
        is_complete: isComplete,
    });
};
