import type { AceRegistryType } from '#/schemas/registryTypes';
import type { BaseBlock, ParserBlockHandler, ParserBlockValidator } from '#/schemas/parser';

type ContextAction = 'update' | 'retrieve' | 'store';

/** Internal block shape used by this parser implementation. */
interface ContextActionBlock extends BaseBlock {
    type: 'context';
    action: ContextAction;
    memory_key?: string;
    result_memory_uid?: string;
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

function normalizeAction(value: unknown): ContextAction {
    const str = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (str === 'retrieve' || str === 'store') return str;
    return 'update';
}

export const validator: ParserBlockValidator = ({ isComplete, payload_json, payload_parse_error }) => {
    if (!isComplete) return;
    if (!payload_json) {
        throw new Error(payload_parse_error || 'context block requires a valid JSON payload');
    }

    return normalizeContextPayload(payload_json, '') ?? payload_json;
};

export const registry: AceRegistryType.Parser = {
    name: 'context',
    slug: 'context',
    tag_name: 'context',
    description: 'Session context management block — update summary, retrieve a stored memory, or store new information.',
    block_schema: {
        purpose: 'Manage persistent session context memory. Update the session summary, retrieve a stored memory by key, or store new information for future retrieval.',
        requiredFields: '"action" (update | retrieve | store). For update: one of "summary","context_summary","type":"summary_update". For retrieve: "memory_key". For store: "title","summary","payload".',
        optionalFields: '"result_memory_uid" (key to store retrieval result), "type", "text", "kind"',
        exampleLines: [
            '  <context>',
            '  {"action":"update","type":"summary_update","text":"User bernama Gilang, sedang mengerjakan proyek React."}',
            '  </context>',
            '',
            '  <context>',
            '  {"action":"retrieve","memory_key":"system:ai_context_rag:payload:some-uid","result_memory_uid":"system:session:abc:ctx_result:1"}',
            '  </context>',
            '',
            '  <context>',
            '  {"action":"store","title":"Project Details","summary":"User is building React app","payload":{"stack":["Vite","TypeScript","Tauri"]}}',
            '  </context>',
        ],
    },
};

export const handler: ParserBlockHandler = ({ body, payload_json, payload_parse_error, isComplete, result, emit_result, request_interrupt, session_id }) => {
    const json = payload_json;
    const action = normalizeAction(json?.action);
    const memoryKey = typeof json?.memory_key === 'string' ? json.memory_key.trim() || undefined : undefined;
    const resultMemoryUid = typeof json?.result_memory_uid === 'string' ? json.result_memory_uid.trim() || undefined : undefined;

    const block: ContextActionBlock = {
        type: 'context',
        action,
        memory_key: memoryKey,
        result_memory_uid: resultMemoryUid,
        payload_raw: body,
        payload_json: json,
        payload_parse_error,
        is_complete: isComplete,
    };

    result.blocks.push(block);

    if (!isComplete) return;

    if (action === 'retrieve') {
        emit_result?.({
            event_name: 'context_retrieve_requested',
            interrupt_hint: true,
            block_type: 'context',
            action: 'retrieve',
            memory_key: memoryKey,
            result_memory_uid: resultMemoryUid,
            session_id,
        });
        request_interrupt?.('context_retrieve_requested');
    } else if (action === 'store') {
        const title = typeof json?.title === 'string' ? json.title : undefined;
        const summary = typeof json?.summary === 'string' ? json.summary : undefined;
        emit_result?.({
            event_name: 'context_store_requested',
            interrupt_hint: true,
            block_type: 'context',
            action: 'store',
            title,
            summary,
            result_memory_uid: resultMemoryUid,
            payload: json?.payload,
            session_id,
        });
        request_interrupt?.('context_store_requested');
    }
    // 'update' action: stream handler handles it directly via AIContextEngine.ingestContextBlock
};
