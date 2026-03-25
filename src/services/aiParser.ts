import type { BufferedAIEvent } from '../schemas/ai_protocol';
import { AITextBlockHeaderSchema } from '../schemas/ai_protocol';

export type ExecutionBlockType = 'execute_tool' | 'execute_storage';
export type ExecutionBlockStatus =
    | 'pending'
    | 'queued'
    | 'running'
    | 'completed'
    | 'error'
    | 'cancelled'
    | 'unknown';

export interface BaseExecutionBlock {
    type: ExecutionBlockType;
    status: ExecutionBlockStatus;
    memory_uid?: string;
    result_memory_uid?: string;
    operation?: string;
    payload_raw: string;
    payload_json: Record<string, unknown> | null;
    payload_parse_error?: string;
    is_complete: boolean;
}

/**
 * Ordered segment model for one stream chunk.
 * This is the core format UI/state managers should consume.
 */
export type AIMessageBlock =
    | { type: 'paragraph'; content: string }
    | { type: 'event'; event: BufferedAIEvent }
    | BaseExecutionBlock
    | {
        // Future-proof fallback for upcoming fenced directives
        type: 'directive';
        directive_name: string;
        content: string;
        is_complete: boolean;
    };

/**
 * Result of parsing one stream chunk.
 *
 * blocks      - ordered typed segments (primary output)
 * events      - flattened event list (backward compatibility)
 * textToPrint - concatenated paragraph text (backward compatibility)
 */
export interface AIParseResult {
    blocks: AIMessageBlock[];
    events: BufferedAIEvent[];
    textToPrint: string;
}

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
    if (
        str === 'pending' ||
        str === 'queued' ||
        str === 'running' ||
        str === 'completed' ||
        str === 'error' ||
        str === 'cancelled'
    ) {
        return str;
    }
    return 'unknown';
}

function extractExecutionBlock(tag: ExecutionBlockType, body: string, isComplete: boolean): BaseExecutionBlock {
    const { json, error } = parseJsonLoose(body);

    const status = normalizeStatus(
        json?.status ?? json?.state ?? (isComplete ? 'completed' : 'pending'),
    );

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

function parseEventBlock(body: string): {
    event?: BufferedAIEvent;
    fallbackText?: string;
} {
    const firstLineBreak = body.indexOf('\n');
    if (firstLineBreak === -1) {
        return { fallbackText: `\`\`\`event\n${body}` };
    }

    const headerLine = body.slice(0, firstLineBreak).trim();
    const payloadSection = body.slice(firstLineBreak + 1);
    const payload = payloadSection.replace(/\n?end_event\s*$/, '');

    const headerParts = headerLine.split(',').map((s) => s.trim());
    const headerValidation = AITextBlockHeaderSchema.safeParse(headerParts);

    if (!headerValidation.success) {
        return { fallbackText: `\`\`\`event\n${body}` };
    }

    const [event_type, window_uid, process_uid_raw, widget_uid_raw, action, sub_action] = headerValidation.data;

    const event: BufferedAIEvent = {
        headers: {
            event_type,
            window_uid,
            process_uid: process_uid_raw === 'null' || process_uid_raw === null ? undefined : process_uid_raw,
            widget_uid: widget_uid_raw === 'null' || widget_uid_raw === null ? undefined : widget_uid_raw,
            action,
            sub_action,
        },
        raw_payload_buffer: payload,
        // Historical contract: end_event is the source of truth for completion,
        // even if the markdown closing fence arrives in a later chunk.
        is_complete: /\n?end_event\s*$/.test(payloadSection),
    };

    return { event };
}

/**
 * Parse one raw stream chunk into typed blocks.
 */
export function parseAIStreamChunk(chunk: string): AIParseResult {
    const result: AIParseResult = {
        blocks: [],
        events: [],
        textToPrint: '',
    };

    let cursor = 0;

    while (cursor < chunk.length) {
        const fenceStart = chunk.indexOf('```', cursor);

        if (fenceStart === -1) {
            const text = chunk.slice(cursor);
            if (text) {
                result.blocks.push({ type: 'paragraph', content: text });
                result.textToPrint += text;
            }
            break;
        }

        if (fenceStart > cursor) {
            const text = chunk.slice(cursor, fenceStart);
            result.blocks.push({ type: 'paragraph', content: text });
            result.textToPrint += text;
        }

        const tagLineEnd = chunk.indexOf('\n', fenceStart + 3);
        if (tagLineEnd === -1) {
            // Incomplete fence header; keep as paragraph text so nothing is lost.
            const text = chunk.slice(fenceStart);
            result.blocks.push({ type: 'paragraph', content: text });
            result.textToPrint += text;
            break;
        }

        const rawTag = chunk.slice(fenceStart + 3, tagLineEnd).trim().toLowerCase();
        const bodyStart = tagLineEnd + 1;

        const closeFence = chunk.indexOf('\n```', bodyStart);
        const hasCloseFence = closeFence !== -1;
        const bodyEnd = hasCloseFence ? closeFence : chunk.length;
        const body = chunk.slice(bodyStart, bodyEnd);

        if (rawTag === 'event' || rawTag === 'json') {
            const parsed = parseEventBlock(body);
            if (parsed.event) {
                result.events.push(parsed.event);
                result.blocks.push({ type: 'event', event: parsed.event });
            } else if (parsed.fallbackText) {
                result.blocks.push({ type: 'paragraph', content: parsed.fallbackText });
                result.textToPrint += parsed.fallbackText;
            }
        } else if (rawTag === 'execute_tool' || rawTag === 'execute_storage') {
            result.blocks.push(extractExecutionBlock(rawTag, body, hasCloseFence));
        } else {
            // Unknown fenced directives are still structured for forward compatibility.
            result.blocks.push({
                type: 'directive',
                directive_name: rawTag || 'unknown',
                content: body,
                is_complete: hasCloseFence,
            });
        }

        if (!hasCloseFence) {
            // No close fence in this chunk, stop and let upstream buffer handling continue.
            break;
        }

        cursor = closeFence + 4; // skip '\n```'
        if (cursor < chunk.length && chunk[cursor] === '\n') cursor += 1;
    }

    return result;
}
