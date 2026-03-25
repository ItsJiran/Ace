import type { AceRegistryType } from '#/schemas/registryTypes';
import type {
    BaseExecutionBlock,
    ExecutionBlockStatus,
    ExecutionBlockType,
    ParserBlockHandler,
} from '#/schemas/parserBlocks';

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

function normalizeStatus(value: unknown): ExecutionBlockStatus {
    const str = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (str === 'pending' || str === 'queued' || str === 'running' || str === 'completed' || str === 'error' || str === 'cancelled') {
        return str;
    }
    return 'unknown';
}

function extractExecutionBlock(tag: ExecutionBlockType, body: string, isComplete: boolean): BaseExecutionBlock {
    const { json, error } = parseJsonLoose(body);
    const status = normalizeStatus(json?.status ?? json?.state ?? (isComplete ? 'completed' : 'pending'));
    const memoryUid =
        typeof json?.memory_uid === 'string'
            ? json.memory_uid
            : typeof json?.memory_key === 'string'
                ? json.memory_key
                : undefined;
    const resultMemoryUid =
        typeof json?.result_memory_uid === 'string'
            ? json.result_memory_uid
            : typeof json?.result_key === 'string'
                ? json.result_key
                : undefined;
    const operation =
        typeof json?.operation === 'string'
            ? json.operation
            : typeof json?.tool === 'string'
                ? json.tool
                : typeof json?.action === 'string'
                    ? json.action
                    : undefined;

    return {
        type: tag,
        status,
        memory_uid: memoryUid,
        result_memory_uid: resultMemoryUid,
        operation,
        payload_raw: body,
        payload_json: json,
        payload_parse_error: error,
        is_complete: isComplete,
    };
}

export const registry: AceRegistryType.Parser = {
    name: 'execute_storage',
    slug: 'execute_storage',
    tag_name: 'execute_storage',
    description: 'Request runtime storage operation.',
    block_schema: {
        purpose: 'Request a direct storage/memory operation (read or write persistent record).',
        requiredFields: '"operation" (e.g. "write_memory", "read_memory"), "memory_uid".',
        optionalFields: '"payload" object for write operations, "result_memory_uid" to store read result.',
        exampleLines: [
            '  <execute_storage>',
            '  {"operation":"write_memory","memory_uid":"system:memory:user_prefs","payload":{"theme":"dark"}}',
            '  </execute_storage>',
            '  Preferensi sudah disimpan.',
        ],
    },
};

const executeStorageHandler: ParserBlockHandler = ({ body, isComplete, result }) => {
    result.blocks.push(extractExecutionBlock('execute_storage', body, isComplete));
};

export default executeStorageHandler;
