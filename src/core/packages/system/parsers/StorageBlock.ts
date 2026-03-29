import type { AceRegistryType } from '#/schemas/registryTypes';
import type { BaseBlock, ParserBlockHandler, ParserBlockValidator } from '#/schemas/parser';

type StorageBlockAction = 'read' | 'list' | 'view_db' | 'write' | 'delete';
type StorageBlockStatus = 'pending' | 'queued' | 'running' | 'completed' | 'error' | 'cancelled' | 'unknown';

interface StorageBlock extends BaseBlock {
    block_slug: 'storage';
    memory_uid?: string;
    result_memory_uid?: string;
    action?: StorageBlockAction;
    status: StorageBlockStatus;
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

function extractStorageBlock(
    body: string,
    json: Record<string, unknown> | null,
    parseError: string | undefined,
    isComplete: boolean,
): StorageBlock {

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
        block_slug: 'storage',
        status,
        action,
        memory_uid: memoryUid,
        result_memory_uid: resultMemoryUid,
        payload_raw: body,
        payload_json: json,
        payload_parse_error: parseError,
        is_complete: isComplete,
    };
}

export const validator: ParserBlockValidator = ({ isComplete, payload_json, payload_parse_error }) => {
    if (!isComplete) return;
    if (!payload_json) {
        throw new Error(payload_parse_error || 'storage block requires a valid JSON payload');
    }

    return {
        ...payload_json,
        action: normalizeAction(payload_json.action ?? payload_json.operation),
        status: normalizeStatus(payload_json.status ?? payload_json.state, isComplete),
        memory_uid:
            typeof payload_json.memory_uid === 'string' ? payload_json.memory_uid :
            typeof payload_json.memory_key === 'string' ? payload_json.memory_key :
            undefined,
        result_memory_uid:
            typeof payload_json.result_memory_uid === 'string' ? payload_json.result_memory_uid :
            typeof payload_json.result_key === 'string' ? payload_json.result_key :
            undefined,
    };
};

export const registry: AceRegistryType.Parser = {
    name: 'storage',
    slug: 'storage',
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
        triggerConditions: [
            'AI needs to store conversational context or intermediate results in memory',
            'AI wants to read previously stored information or session data',
            'AI needs to list available memory keys or inspect the database structure',
            'AI intends to update or delete stored data from memory',
            'Tool execution results need to be persisted for later reference',
        ],
        promptExamples: [
            'Remember that the user prefers dark mode',
            'Save the search results for later reference',
            'What information do I have stored about this user?',
            'List all session variables I\'ve saved',
            'Retrieve the previous conversation summary',
            'Delete the temporary cache from memory',
            'Store this configuration for future use',
        ],
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

export const handler: ParserBlockHandler = ({ body, payload_json, payload_parse_error, isComplete, result, emit_result, request_interrupt, push_renderer }) => {
    const block = extractStorageBlock(body, payload_json, payload_parse_error, isComplete);
    result.blocks.push(block);

    if (!isComplete) return;

    emit_result?.({
        event_name: 'storage_block_parsed',
        block_slug: 'storage',
        action: block.action,
        status: block.status,
        memory_uid: block.memory_uid,
        result_memory_uid: block.result_memory_uid,
    });

    // Push storage status renderer directly into the turn renderer memory.
    // This prevents token waste—handler determines visual directly via push_renderer.
    push_renderer?.({
        renderer_slug: 'storage-renderer',
        props: {
            action: block.action || 'unknown',
            status: block.status || 'pending',
            memory_path: block.memory_uid,
        },
    });

    request_interrupt?.('storage_action_requested');
    emit_result?.({
        event_name: 'storage_interrupt_requested',
        interrupt_hint: true,
        block_slug: 'storage',
        action: block.action,
        memory_uid: block.memory_uid,
    });
};
