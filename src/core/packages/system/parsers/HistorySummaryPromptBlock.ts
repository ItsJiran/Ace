import type { AceRegistryType } from '#/schemas/registryTypes';
import type { HistorySummaryBlock, ParserBlockHandler } from '#/schemas/parserBlocks';

function parseJsonLoose(raw: string): {
    json: Record<string, unknown> | null;
    error?: string;
} {
    const trimmed = raw.trim();
    if (!trimmed) return { json: null };

    try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return { json: parsed as Record<string, unknown> };
        }
        return { json: { value: parsed } };
    } catch (error) {
        return { json: null, error: error instanceof Error ? error.message : String(error) };
    }
}

function normalizeHistorySummaryPayload(
    payload: Record<string, unknown> | null,
    rawBody: string,
    blockType: HistorySummaryBlock['type'],
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
    tag_name: 'history_summary_ai_prompt',
    description: 'Compact summary of the current user prompt.',
    block_schema: {
        purpose: 'Compact summary of the current user message. Emit BEFORE your prose response.',
        requiredFields: '"summary" (string), "memory_key" (exact value from TURN_HISTORY_PROTOCOL section), "ref_uid" (exact value from TURN_HISTORY_PROTOCOL section).',
        exampleLines: [
            '  <history_summary_ai_prompt>',
            '  {"summary":"User meminta pembuatan file catatan baru bernama todo.txt.","memory_key":"system:ai_context_rag:payload:ctxref-prompt","ref_uid":"ref-abc123"}',
            '  </history_summary_ai_prompt>',
        ],
    },
};

const historySummaryPromptHandler: ParserBlockHandler = ({ body, isComplete, result }) => {
    const blockType: HistorySummaryBlock['type'] = 'history_summary_ai_prompt';
    const parsed = parseJsonLoose(body);
    result.blocks.push({
        type: blockType,
        payload_raw: body,
        payload_json: normalizeHistorySummaryPayload(parsed.json, body, blockType),
        payload_parse_error: parsed.error,
        is_complete: isComplete,
    });
};

export default historySummaryPromptHandler;
