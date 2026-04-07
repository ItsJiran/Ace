import { EventBus } from '#/services/eventEngine';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { BaseBlock, ParserBlockHandler, ParserBlockValidator } from '#/schemas/parser';

type ShellBlockAction = 'run' | 'run_sudo' | 'check_available' | 'output';
type BlockStatus = 'pending' | 'queued' | 'running' | 'completed' | 'error' | 'cancelled' | 'unknown';

interface ShellBlock extends BaseBlock {
    block_slug: 'shell';
    memory_uid?: string;
    result_memory_uid?: string;
    status: BlockStatus;
    
    action: ShellBlockAction;
    command: string;
    args?: string[];
    cwd?: string;
}

function normalizeStatus(value: unknown, isComplete: boolean): BlockStatus {
    const str = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (
        str === 'pending' || str === 'queued' || str === 'running' ||
        str === 'completed' || str === 'error' || str === 'cancelled'
    ) return str;
    return isComplete ? 'completed' : 'pending';
}

function normalizeAction(value: unknown): ShellBlockAction {
    const str = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (str === 'run' || str === 'run_sudo' || str === 'check_available' || str === 'output') return str;
    return 'run';
}

export const validator: ParserBlockValidator = ({ isComplete, payload_json, payload_parse_error }) => {
    if (!isComplete) return;
    if (!payload_json) {
        throw new Error(payload_parse_error || 'shell block requires a valid JSON payload');
    }

    if (!payload_json.command) {
         throw new Error('shell block missing required field "command"');
    }

    return {
        ...payload_json,
        action: normalizeAction(payload_json.action),
        status: normalizeStatus(payload_json.status ?? payload_json.state, isComplete),
        command: payload_json.command,
        args: Array.isArray(payload_json.args) ? payload_json.args : undefined,
        cwd: typeof payload_json.cwd === 'string' ? payload_json.cwd : undefined,
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
    name: 'shell',
    slug: 'shell',
    description: 'Execute shell commands on the host system natively. This replaces using the generic tool block for OS automation.',
    runtime_behavior: {
        interrupt_mode: 'pause_stream',
        interrupt_on_complete: false,
    },
    block_schema: {
        purpose: 'Execute shell commands natively on the host system to interact with the OS.',
        requiredFields: '"action" (run | run_sudo | check_available | output), "command" (string).',
        optionalFields:
            '"args" (array of strings), ' +
            '"cwd" (string working directory), ' +
            '"memory_uid" (where to store result), ' +
            '"result_memory_uid", ' +
            '"status" (pending | running | completed | error).',
        triggerConditions: [
            'AI needs to execute a terminal or terminal-like command',
            'AI needs to check if a CLI tool is available',
            'User asks to install, run, build, or deploy a project via shell',
        ],
        promptExamples: [
            'Check my current node version',
            'Run npm install',
            'Execute this script file in bash',
            'Kill the process running on port 3000',
        ],
        exampleLines: [
            '  <shell>',
            '  {"action":"run","command":"ls","args":["-la","/home/user"],"status":"pending"}',
            '  </shell>',
            '',
            '  <shell>',
            '  {"action":"output","command":"node","args":["-v"],"result_memory_uid":"node_version_check","status":"pending"}',
            '  </shell>'
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
    const block: ShellBlock = {
        block_slug: 'shell',
        action: normalizeAction(payload_json?.action),
        status: normalizeStatus(payload_json?.status ?? payload_json?.state, isComplete),
        command: payload_json?.command,
        args: Array.isArray(payload_json?.args) ? payload_json.args : undefined,
        cwd: typeof payload_json?.cwd === 'string' ? payload_json.cwd : undefined,
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
        event_name: 'tool_block_parsed', // Retain generic event names for gateway
        block_slug: 'shell',
        action: block.action,
        status: block.status,
        tool_slug: 'shell-tool',
        package_ref: 'itsjiran/ace-system',
        memory_uid: block.memory_uid,
        result_memory_uid: block.result_memory_uid,
    });

    push_renderer?.({
        renderer_slug: 'tool-renderer',
        status: 'streaming',
        props: {
            tool_slug: 'shell-tool',
            action: block.action || 'run',
            status: block.status || 'pending',
            package_ref: 'itsjiran/ace-system',
            memory_uid: block.memory_uid,
            result_memory_uid: block.result_memory_uid,
            command: block.command,
        },
    });

    request_interrupt?.('tool_block_action_requires_feedback');
    console.log('Shell block parsed, requesting interrupt for feedback loop:', block);

    if (process_uid && block.action) {
        // Disguise shell block as a execute tool so tool runner picks it up normally
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
                tool_slug: 'shell-tool',
                memory_uid: block.memory_uid,
                action: block.action,
                command: block.command,
                args: block.args,
                cwd: block.cwd,
            },
        });
    }
};
