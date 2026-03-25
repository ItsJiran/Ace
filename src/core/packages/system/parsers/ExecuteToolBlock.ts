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
    name: 'execute_tool',
    slug: 'execute_tool',
    tag_name: 'execute_tool',
    description: 'Request runtime tool execution.',
    block_schema: {
        purpose: 'Request the runtime to invoke a named tool (file system, HTTP, etc.).',
        requiredFields: '"tool" (tool name string), "status":"pending".',
        optionalFields: '"memory_uid" (where to store result), any additional tool-specific arguments.',
        exampleLines: [
            '  <execute_tool>',
            '  {"tool":"fs.write_file","status":"pending","memory_uid":"system:tool:123","path":"/tmp/note.txt","content":"Hello"}',
            '  </execute_tool>',
            '  Saya sedang menyiapkan penulisan file.',
        ],
    },
};

const executeToolHandler: ParserBlockHandler = ({ body, isComplete, result }) => {
    result.blocks.push(extractExecutionBlock('execute_tool', body, isComplete));
};

export default executeToolHandler;
