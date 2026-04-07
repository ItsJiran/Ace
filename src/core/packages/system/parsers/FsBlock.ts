import { EventBus } from '#/services/eventEngine';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { BaseBlock, ParserBlockHandler, ParserBlockValidator } from '#/schemas/parser';

type FsBlockAction = 'read_file' | 'write_file' | 'list_directory' | 'create_directory' | 'delete_file';
type BlockStatus = 'pending' | 'queued' | 'running' | 'completed' | 'error' | 'cancelled' | 'unknown';

interface FsBlock extends BaseBlock {
    block_slug: 'fs';
    memory_uid?: string;
    result_memory_uid?: string;
    status: BlockStatus;
    
    action: FsBlockAction;
    path: string;
    content?: string;
}

function normalizeStatus(value: unknown, isComplete: boolean): BlockStatus {
    const str = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (
        str === 'pending' || str === 'queued' || str === 'running' ||
        str === 'completed' || str === 'error' || str === 'cancelled'
    ) return str;
    return isComplete ? 'completed' : 'pending';
}

function normalizeAction(value: unknown): FsBlockAction {
    const str = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (str === 'read_file' || str === 'write_file' || str === 'list_directory' || str === 'create_directory' || str === 'delete_file') return str as FsBlockAction;
    return 'list_directory';
}

export const validator: ParserBlockValidator = ({ isComplete, payload_json, payload_parse_error }) => {
    if (!isComplete) return;
    if (!payload_json) {
        throw new Error(payload_parse_error || 'fs block requires a valid JSON payload');
    }

    if (!payload_json.path) {
         throw new Error('fs block missing required field "path"');
    }

    return {
        ...payload_json,
        action: normalizeAction(payload_json.action),
        status: normalizeStatus(payload_json.status ?? payload_json.state, isComplete),
        path: payload_json.path,
        content: typeof payload_json.content === 'string' ? payload_json.content : undefined,
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
    name: 'fs',
    slug: 'fs',
    description: 'Manage files and directories natively via host filesystem API. Provides direct file mutations.',
    runtime_behavior: {
        interrupt_mode: 'pause_stream',
        interrupt_on_complete: false,
    },
    block_schema: {
        purpose: 'Directly invoke file management logic inside the user workspace natively.',
        requiredFields: '"action" (read_file | write_file | list_directory | create_directory | delete_file), "path" (string).',
        optionalFields:
            '"content" (required ONLY when action=write_file), ' +
            '"memory_uid" (where to store result), ' +
            '"result_memory_uid", ' +
            '"status" (pending | running | completed | error).',
        triggerConditions: [
            'AI needs to read a file from the repository',
            'AI needs to list files in a folder',
            'AI needs to create or delete files',
            'User asks AI to write a new file or script',
        ],
        promptExamples: [
            'Read the content of main.ts',
            'Create a new directory named src/components',
            'Delete the file old.ts',
            'List everything inside src',
        ],
        exampleLines: [
            '  <fs>',
            '  {"action":"read_file","path":"src/index.ts","status":"pending"}',
            '  </fs>',
            '',
            '  <fs>',
            '  {"action":"write_file","path":"docs/hello.txt","content":"Hello World","status":"pending"}',
            '  </fs>'
        ],
    },
};

export const handler: ParserBlockHandler = ({
    body,
    payload_json,
    payload_parse_error,
    isComplete,
    result,
    session_id,
    process_uid,
    emit_result,
    request_interrupt,
    push_renderer,
}) => {
    const block: FsBlock = {
        block_slug: 'fs',
        action: normalizeAction(payload_json?.action),
        status: normalizeStatus(payload_json?.status ?? payload_json?.state, isComplete),
        path: payload_json?.path,
        content: typeof payload_json?.content === 'string' ? payload_json.content : undefined,
        memory_uid: typeof payload_json?.memory_uid === 'string' ? payload_json.memory_uid : typeof payload_json?.memory_key === 'string' ? payload_json.memory_key : undefined,
        result_memory_uid: typeof payload_json?.result_memory_uid === 'string' ? payload_json.result_memory_uid : typeof payload_json?.result_key === 'string' ? payload_json.result_key : undefined,
        payload_raw: body,
        payload_json,
        payload_parse_error,
        is_complete: isComplete,
    };
    result.blocks.push(block);

    if (!isComplete) return;

    emit_result?.({
        event_name: 'tool_block_parsed',
        block_slug: 'fs',
        action: block.action,
        status: block.status,
        tool_slug: 'fs-tool',
        package_ref: 'itsjiran/ace-system',
        memory_uid: block.memory_uid,
        result_memory_uid: block.result_memory_uid,
    });

    push_renderer?.({
        renderer_slug: 'tool-renderer',
        status: 'streaming',
        props: {
            tool_slug: 'fs-tool',
            action: block.action || 'list_directory',
            status: block.status || 'pending',
            package_ref: 'itsjiran/ace-system',
            memory_uid: block.memory_uid,
            result_memory_uid: block.result_memory_uid,
            path: block.path,
        },
    });

    request_interrupt?.('tool_block_action_requires_feedback');

    if (process_uid && block.action) {
        EventBus.emit({
            action: 'tool',
            sub_action: 'execute',
            process_uid,
            preallocated_memory: {
                session_id,
                result_key: block.result_memory_uid,
            },
            payload: {
                package_ref: 'itsjiran/ace-system',
                tool_slug: 'fs-tool',
                memory_uid: block.memory_uid,
                action: block.action,
                path: block.path,
                content: block.content,
            },
        });
    }
};
