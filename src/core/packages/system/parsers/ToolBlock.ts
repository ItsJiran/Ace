import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ActionBlock, ParserBlockHandler } from '#/schemas/parser';

export type ToolBlockAction = 'list' | 'view_schema' | 'execute';
export type ToolBlockStatus = 'pending' | 'queued' | 'running' | 'completed' | 'error' | 'cancelled' | 'unknown';

export interface ToolBlock extends ActionBlock {
    type: 'tool';
    action?: ToolBlockAction;
    status: ToolBlockStatus;
    tool_slug?: string;
    package_ref?: string;
}

function parseJsonLoose(raw: string): {
    json: Record<string, unknown> | null;
    error?: string;
} {
    const trimmed = raw.trim();
    if (!trimmed) return { json: null };

    const stripOuterTag = (input: string): string => {
        const match = input.match(/^<tool>\s*([\s\S]*?)\s*<\/tool>$/i);
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

function extractToolBlock(body: string, isComplete: boolean): ToolBlock {
    const { json, error } = parseJsonLoose(body);

    const action = normalizeAction(json?.action);
    const status = normalizeStatus(json?.status ?? json?.state, isComplete);

    const toolSlug =
        typeof json?.tool_slug === 'string' ? json.tool_slug.trim() :
        typeof json?.tool === 'string'      ? json.tool.trim() :
        typeof json?.name === 'string'      ? json.name.trim() :
        undefined;

    const packageRef =
        typeof json?.package_ref === 'string' ? json.package_ref.trim() :
        typeof json?.package === 'string'     ? json.package.trim() :
        undefined;

    const memoryUid =
        typeof json?.memory_uid === 'string' ? json.memory_uid :
        typeof json?.memory_key === 'string' ? json.memory_key :
        undefined;

    const resultMemoryUid =
        typeof json?.result_memory_uid === 'string' ? json.result_memory_uid :
        typeof json?.result_key === 'string'         ? json.result_key :
        undefined;

    return {
        type: 'tool',
        status,
        action,
        tool_slug: toolSlug,
        package_ref: packageRef,
        memory_uid: memoryUid,
        result_memory_uid: resultMemoryUid,
        payload_raw: body,
        payload_json: json,
        payload_parse_error: error,
        is_complete: isComplete,
    };
}

export const registry: AceRegistryType.Parser = {
    name: 'tool',
    slug: 'tool',
    tag_name: 'tool',
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
            'plus any tool-specific arguments for execute.',
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
            '  {"action":"execute","tool_slug":"fs-tool","package_ref":"itsjiran/ace-system","memory_uid":"system:tool:exec:123","result_memory_uid":"system:tool:result:123","status":"pending","path":"notes/todo.md"}',
            '  </tool>',
            '  Saya sedang membaca file tersebut.',
        ],
    },
};

const toolBlockHandler: ParserBlockHandler = ({ body, isComplete, result, emit_result, request_interrupt }) => {
    const block = extractToolBlock(body, isComplete);
    result.blocks.push(block);

    if (!isComplete) return;

    emit_result?.({
        event_name: 'tool_block_parsed',
        block_type: 'tool',
        action: block.action,
        status: block.status,
        tool_slug: block.tool_slug,
        package_ref: block.package_ref,
        memory_uid: block.memory_uid,
        result_memory_uid: block.result_memory_uid,
    });

    if (block.action === 'list' || block.action === 'view_schema' || block.action === 'execute') {
        request_interrupt?.(`tool_${block.action}_requested`);
        emit_result?.({
            event_name: 'tool_interrupt_requested',
            interrupt_hint: true,
            block_type: 'tool',
            action: block.action,
            tool_slug: block.tool_slug,
            package_ref: block.package_ref,
        });
    }
};

export default toolBlockHandler;
