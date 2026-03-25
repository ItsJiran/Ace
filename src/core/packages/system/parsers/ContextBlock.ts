import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ParserBlockHandler } from '#/schemas/parserBlocks';

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

function normalizeContextPayload(
    payload: Record<string, unknown> | null,
    rawBody: string,
): Record<string, unknown> | null {
    if (!payload) {
        const fallback = rawBody.trim();
        return fallback ? { type: 'context_note', text: fallback } : null;
    }

    const normalized: Record<string, unknown> = { ...payload };
    const nestedContext = payload.context;
    if (nestedContext && typeof nestedContext === 'object' && !Array.isArray(nestedContext)) {
        const nested = nestedContext as Record<string, unknown>;
        if (typeof normalized.summary !== 'string' && typeof nested.summary === 'string') normalized.summary = nested.summary;
        if (typeof normalized.context_summary !== 'string' && typeof nested.context_summary === 'string') normalized.context_summary = nested.context_summary;
        if (typeof normalized.intent !== 'string' && typeof nested.intent === 'string') normalized.intent = nested.intent;
        if (typeof normalized.type !== 'string' && typeof nested.type === 'string') normalized.type = nested.type;
        if (typeof normalized.kind !== 'string' && typeof nested.kind === 'string') normalized.kind = nested.kind;
        if (typeof normalized.text !== 'string' && typeof nested.text === 'string') normalized.text = nested.text;
        if (typeof normalized.replace_summary !== 'string' && typeof nested.replace_summary === 'string') normalized.replace_summary = nested.replace_summary;
    }

    return normalized;
}

export const registry: AceRegistryType.Parser = {
    name: 'context',
    slug: 'context',
    tag_name: 'context',
    description: 'Persistent session context update block.',
    block_schema: {
        purpose: 'Update the persistent session summary for future turns.',
        requiredFields: 'one of — "summary":"...", or "context_summary":"...", or "type":"summary_update" with "text":"..."',
        exampleLines: [
            '  <context>',
            '  {"type":"summary_update","text":"User bernama Gilang, sedang mengerjakan proyek React."}',
            '  </context>',
            '  Saya siap membantu.',
        ],
    },
};

const contextBlockHandler: ParserBlockHandler = ({ body, isComplete, result }) => {
    const parsed = parseJsonLoose(body);
    result.blocks.push({
        type: 'context',
        payload_raw: body,
        payload_json: normalizeContextPayload(parsed.json, body),
        payload_parse_error: parsed.error,
        is_complete: isComplete,
    });
};

export default contextBlockHandler;
