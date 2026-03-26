import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ActionBlock, ParserBlockHandler } from '#/schemas/parser';

export type StorageBlockAction = 'read' | 'list' | 'view_db' | 'write' | 'delete';
export type StorageBlockStatus = 'pending' | 'queued' | 'running' | 'completed' | 'error' | 'cancelled' | 'unknown';

export interface StorageBlock extends ActionBlock {
    type: 'storage';
    action?: StorageBlockAction;
    status: StorageBlockStatus;
}

function parseJsonLoose(raw: string): {
    json: Record<string, unknown> | null;
    error?: string;
} {
    const trimmed = raw.trim();
    if (!trimmed) return { json: null };

    const stripOuterTag = (input: string): string => {
        const match = input.match(/^<storage>\s*([\s\S]*?)\s*<\/storage>$/i);
        return match ? match[1].trim() : input;
    };

    const stripCodeFence = (input: string): string => {
        const match = input.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
        return match ? match[1].trim() : input;
    };

    const extractObjectCandidate = (input: string): string => {
        const start = input.indexOf('{');
        const end = input.lastIndexOf('}');
        if (start === -1 || end === -1 || end <= start) return input;
        return input.slice(start, end + 1).trim();
    };

    const candidates = [
        trimmed,
        stripOuterTag(trimmed),
        stripCodeFence(trimmed),
        stripCodeFence(stripOuterTag(trimmed)),
        extractObjectCandidate(trimmed),
        extractObjectCandidate(stripCodeFence(stripOuterTag(trimmed))),
    ].filter((value, index, arr) => value.length > 0 && arr.indexOf(value) === index);

    let lastError = 'Invalid JSON payload.';

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate) as unknown;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return { json: parsed as Record<string, unknown> };
            }
            return { json: { value: parsed } };
        } catch (error) {
            lastError = error instanceof Error ? error.message : String(error);
        }
    }

    return { json: null, error: lastError };
}

function normalizeAction(value: unknown): StorageBlockAction | undefined {
    const str = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (str === 'read' || str === 'list' || str === 'view_db' || str === 'write' || str === 'delete') return str;
    if (str === 'read_memory' || str === 'get_memory') return 'read';
    if (str === 'write_memory' || str === 'set_memory' || str === 'update_memory' || str === 'create_memory') return 'write';
    if (str === 'delete_memory' || str === 'remove_memory') return 'delete';
    if (str === 'list_memory' || str === 'list_keys') return 'list';
    return undefined;
}

function normalizeStatus(value: unknown, isComplete: boolean): StorageBlockStatus {
    const str = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (
        str === 'pending' || str === 'queued' || str === 'running' ||
        str === 'completed' || str === 'error' || str === 'cancelled'
    ) return str;
    return isComplete ? 'completed' : 'pending';
}

function extractStorageBlock(body: string, isComplete: boolean): StorageBlock {
    const { json, error } = parseJsonLoose(body);

    const action = normalizeAction(json?.action ?? json?.operation);
    const status = normalizeStatus(json?.status ?? json?.state, isComplete);

    const memoryUid =
        typeof json?.memory_uid === 'string' ? json.memory_uid :
        typeof json?.memory_key === 'string' ? json.memory_key :
        undefined;

    const resultMemoryUid =
        typeof json?.result_memory_uid === 'string' ? json.result_memory_uid :
        typeof json?.result_key === 'string'         ? json.result_key :
        undefined;

    return {
        type: 'storage',
        status,
        action,
        memory_uid: memoryUid,
        result_memory_uid: resultMemoryUid,
        payload_raw: body,
        payload_json: json,
        payload_parse_error: error,
        is_complete: isComplete,
    };
}

export const registry: AceRegistryType.Parser = {
    name: 'storage',
    slug: 'storage',
    tag_name: 'storage',
    description: 'Interact with the runtime storage/memory — read, list, view db, write, or delete memory keys.',
    runtime_behavior: {
        interrupt_mode: 'pause_stream',
        interrupt_on_complete: false,
    },
    block_schema: {
        purpose: 'Read, list, inspect, write, or delete entries in the runtime RAM/storage.',
        requiredFields: '"action" (read | list | view_db | write | delete).',
        optionalFields:
            '"memory_uid" (required for read, write, delete), ' +
            '"result_memory_uid" (where to store read result), ' +
            '"pattern" (for list — key prefix or glob), ' +
            '"scope" (for view_db — namespace filter), ' +
            '"payload" (for write — the data to store), ' +
            '"status" (pending | running | completed | error).',
        exampleLines: [
            '  <storage>',
            '  {"action":"read","memory_uid":"system:session:abc:summary","result_memory_uid":"system:tool:result:456","status":"pending"}',
            '  </storage>',
            '',
            '  <storage>',
            '  {"action":"list","pattern":"system:session:*","result_memory_uid":"system:tool:result:789","status":"pending"}',
            '  </storage>',
            '',
            '  <storage>',
            '  {"action":"write","memory_uid":"system:session:abc:notes","payload":{"text":"User prefers dark mode"},"status":"pending"}',
            '  </storage>',
            '  Preferensi sudah disimpan.',
        ],
    },
};

const storageBlockHandler: ParserBlockHandler = ({ body, isComplete, result, emit_result, request_interrupt }) => {
    const block = extractStorageBlock(body, isComplete);
    result.blocks.push(block);

    if (!isComplete) return;

    emit_result?.({
        event_name: 'storage_block_parsed',
        block_type: 'storage',
        action: block.action,
        status: block.status,
        memory_uid: block.memory_uid,
        result_memory_uid: block.result_memory_uid,
    });

    request_interrupt?.('storage_action_requested');
    emit_result?.({
        event_name: 'storage_interrupt_requested',
        interrupt_hint: true,
        block_type: 'storage',
        action: block.action,
        memory_uid: block.memory_uid,
    });
};

export default storageBlockHandler;
