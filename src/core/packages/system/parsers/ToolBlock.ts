import type { AceRegistryType } from '#/schemas/registryTypes';
import type { BaseBlock, ParserBlockHandler, ParserBlockValidator } from '#/schemas/parser';

type ToolBlockAction = 'list' | 'view_schema' | 'execute';
type ToolBlockStatus = 'pending' | 'queued' | 'running' | 'completed' | 'error' | 'cancelled' | 'unknown';

interface ToolBlock extends BaseBlock {
    block_slug: 'tool';
    memory_uid?: string;
    result_memory_uid?: string;
    action?: ToolBlockAction;
    status: ToolBlockStatus;
    tool_slug?: string;
    package_ref?: string;
}

function normalizeAction(value: unknown): ToolBlockAction {
    const str = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (str === 'list' || str === 'view_schema' || str === 'execute') return str;
    return 'execute';
}

function normalizeStatus(value: unknown, isComplete: boolean): ToolBlockStatus {
    const str = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (
        str === 'pending' || str === 'queued' || str === 'running' ||
        str === 'completed' || str === 'error' || str === 'cancelled'
    ) return str;
    return isComplete ? 'completed' : 'pending';
}

export const validator: ParserBlockValidator = ({ isComplete, payload_json, payload_parse_error }) => {
    if (!isComplete) return;
    if (!payload_json) {
        throw new Error(payload_parse_error || 'tool block requires a valid JSON payload');
    }

    return {
        ...payload_json,
        action: normalizeAction(payload_json.action),
        status: normalizeStatus(payload_json.status ?? payload_json.state, isComplete),
        tool_slug:
            typeof payload_json.tool_slug === 'string' ? payload_json.tool_slug.trim() :
            typeof payload_json.tool === 'string' ? payload_json.tool.trim() :
            typeof payload_json.name === 'string' ? payload_json.name.trim() :
            undefined,
        package_ref:
            typeof payload_json.package_ref === 'string' ? payload_json.package_ref.trim() :
            typeof payload_json.package === 'string' ? payload_json.package.trim() :
            undefined,
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
    name: 'tool',
    slug: 'tool',
    description: 'Interact with registered tools — list available tools, view a tool schema, or execute a tool.',
    runtime_behavior: {
        interrupt_mode: 'pause_stream',
        interrupt_on_complete: false,
    },
    block_schema: {
        purpose: 'List registered tools, view a tool parameter schema, or request tool execution.',
        requiredFields: '"action" (list | view_schema | execute).',
        optionalFields:
            '"tool_slug" (required for view_schema and execute), ' +
            '"package_ref" (required for execute), ' +
            '"memory_uid" (where to store result), ' +
            '"result_memory_uid", ' +
            '"status" (pending | running | completed | error), ' +
            '"payload" or "input" for tool-specific arguments when execute is used.',
        triggerConditions: [
            'User requests to see available tools or asks about tool capabilities',
            'User requests to view a specific tool\'s parameters or schema',
            'AI decides to execute a tool to complete a user task',
            'AI needs to gather information about what tools are available before executing one',
        ],
        promptExamples: [
            'List all available tools in the system',
            'What tools do I have access to?',
            'Show me the parameters for the file-search tool',
            'I need to execute the notification tool to send a message',
            'Can you search for files matching the pattern "*.txt"?',
            'Use the available tools to help me with this task',
        ],
        exampleLines: [
            '  <tool>',
            '  {"action":"list","status":"pending"}',
            '  </tool>',
            '',
            '  <tool>',
            '  {"action":"view_schema","tool_slug":"fs-tool","package_ref":"itsjiran/ace-system","status":"pending"}',
            '  </tool>',
            '',
            '  <tool>',
            '  {"action":"execute","tool_slug":"fs-tool","package_ref":"itsjiran/ace-system","memory_uid":"system:tool:exec:123","result_memory_uid":"system:tool:result:123","status":"pending","payload":{"action":"list_directory","path":"~/"}}',
            '  </tool>',
            '  Saya sedang membaca file tersebut.',
        ],
    },
};

export const handler: ParserBlockHandler = ({ body, payload_json, payload_parse_error, isComplete, result, emit_result, request_interrupt }) => {
    const block: ToolBlock = {
        block_slug: 'tool',
        action: normalizeAction(payload_json?.action),
        status: normalizeStatus(payload_json?.status ?? payload_json?.state, isComplete),
        tool_slug: typeof payload_json?.tool_slug === 'string' ? payload_json.tool_slug : undefined,
        package_ref: typeof payload_json?.package_ref === 'string' ? payload_json.package_ref : undefined,
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
        block_slug: 'tool',
        action: block.action,
        status: block.status,
        tool_slug: block.tool_slug,
        package_ref: block.package_ref,
        memory_uid: block.memory_uid,
        result_memory_uid: block.result_memory_uid,
    });

    // Request stream interrupt after tool block is complete.
    // This stops the stream parser and triggers feedback-based loop in gateway.
    // The interaction loop will then:
    // 1. Wait for tool action completion (list/execute result)
    // 2. Stamp action feedback into context memory
    // 3. Inject feedback prompt + memory pointers back to AI
    // 4. Resume with new continuation prompt containing tool results
    request_interrupt?.('tool_block_action_requires_feedback');
};
