import { ParserEngine } from '#/services/parserEngine';
import type {
    AIParseResult,
} from '#/schemas/parser';

export type {
    ActionBlock,
    AIMessageBlock,
    AIParseResult,
    BaseBlock,
    BlockProtocolSchema,
    ParserBlockRuntime,
} from '#/schemas/parser';

export interface ParserTokenTrace {
    sessionId?: string;
    at: number;
    sequenceNumber: number;
    inputBytes: number;
    inputPreview: string;
    carryoverInputBytes: number;
    carryoverPreview: string;
    outputBlocks: number;
    outputEvents: number;
    outputTextBytes: number;
    outputTextPreview: string;
    outputCarryoverBytes: number;
    outputCarryoverPreview: string;
    interruptRequested: boolean;
    interruptReason?: string;
}

export function buildBlockProtocolLines(): string {
    return ParserEngine.buildParserBlockProtocolLines();
}

/** @deprecated Import buildBlockProtocolLines() to get an up-to-date catalog. */
export const AI_PARSER_BLOCK_PROTOCOL_LINES = buildBlockProtocolLines();

export interface ParseAIStreamOptions {
    sessionId?: string;
    processUid?: string;
    rawChunk?: string;
    incomingCarryover?: string;
}

function findNextStructuredTagStart(chunk: string, cursor: number): number {
    let index = chunk.indexOf('<', cursor);

    while (index !== -1) {
        const candidate = readStructuredTagAt(chunk, index);
        if (candidate) {
            return index;
        }
        index = chunk.indexOf('<', index + 1);
    }

    return -1;
}

function findPartialStructuredTagTail(chunk: string, cursor: number): number {
    const lastLt = chunk.lastIndexOf('<');
    if (lastLt < cursor) return -1;

    const suffix = chunk.slice(lastLt);
    const isPartial = /^<\s*$/i.test(suffix) || /^<\s*[a-z_][a-z0-9_]*\s*$/i.test(suffix);

    return isPartial ? lastLt : -1;
}

function findPartialStructuredCloseTail(chunk: string, cursor: number): number {
    const lastLt = chunk.lastIndexOf('<');
    if (lastLt < cursor) return -1;

    const suffix = chunk.slice(lastLt);
    const isPartialClose = /^<\s*\/\s*$/i.test(suffix) || /^<\s*\/\s*[a-z_][a-z0-9_]*\s*$/i.test(suffix);

    return isPartialClose ? lastLt : -1;
}

function findPartialFenceTail(chunk: string, cursor: number): number {
    if (chunk.length <= cursor) return -1;

    const tail3 = chunk.slice(Math.max(cursor, chunk.length - 3));
    if (tail3.endsWith('``')) return chunk.length - 2;
    if (tail3.endsWith('`')) return chunk.length - 1;
    return -1;
}

function readStructuredTagAt(chunk: string, index: number): { tag: string; openEnd: number } | null {
    const matched = /^<\s*([a-z_][a-z0-9_]*)\s*>/i.exec(chunk.slice(index));
    if (!matched) {
        return null;
    }

    return {
        tag: matched[1].toLowerCase(),
        openEnd: index + matched[0].length,
    };
}

function findClosingStructuredTag(chunk: string, tag: string, bodyStart: number): { start: number; length: number } | null {
    const tail = chunk.slice(bodyStart);
    const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const closeExpr = new RegExp(`<\\/\\s*${escapedTag}\\s*>`, 'i');
    const matched = closeExpr.exec(tail);
    if (!matched || typeof matched.index !== 'number') return null;
    return {
        start: bodyStart + matched.index,
        length: matched[0].length,
    };
}

function extractStructuredBlock(
    tag: string,
    body: string,
    isComplete: boolean,
    result: AIParseResult,
    options?: ParseAIStreamOptions,
) {
    try {
        const handled = ParserEngine.dispatchParsedBlock({
            tag,
            body,
            isComplete,
            result,
            sessionId: options?.sessionId,
            processUid: options?.processUid,
        });
        if (handled) {
            return;
        }
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        result.interrupt_requested = true;
        result.interrupt_reason = `parser_handler_exception:${tag}:${reason}`;
    }

    result.blocks.push({
        type: 'directive',
        directive_name: tag || 'unknown',
        content: body,
        is_complete: isComplete,
    });
}

function findClosingFence(chunk: string, bodyStart: number): number {
    for (let i = bodyStart; i < chunk.length; i += 1) {
        const isLineStart = i === bodyStart || chunk[i - 1] === '\n';
        if (!isLineStart) continue;

        let j = i;
        let spaces = 0;
        while (spaces < 3 && j < chunk.length && (chunk[j] === ' ' || chunk[j] === '\t')) {
            j += 1;
            spaces += 1;
        }

        if (chunk.slice(j, j + 3) === '```') {
            return i;
        }
    }

    return -1;
}

let globalTokenSequence = 0;
const sessionTokenSequence = new Map<string, number>();

function getNextTokenSequence(sessionId?: string): number {
    if (!sessionId) {
        globalTokenSequence += 1;
        return globalTokenSequence;
    }
    const next = (sessionTokenSequence.get(sessionId) ?? 0) + 1;
    sessionTokenSequence.set(sessionId, next);
    return next;
}

export function parseAIStreamChunk(chunk: string, options?: ParseAIStreamOptions): AIParseResult {
    const result: AIParseResult = {
        blocks: [],
        events: [],
        textToPrint: '',
        carryoverBuffer: '',
    };

    const tokenSequence = getNextTokenSequence(options?.sessionId);
    const traceInputChunk = typeof options?.rawChunk === 'string' ? options.rawChunk : chunk;
    const traceStartCarryover = typeof options?.incomingCarryover === 'string' ? options.incomingCarryover : '';

    let cursor = 0;

    while (cursor < chunk.length) {
        if (result.interrupt_requested) {
            break;
        }

        const fenceStart = chunk.indexOf('```', cursor);
        const tagStart = findNextStructuredTagStart(chunk, cursor);
        const candidateStarts = [fenceStart, tagStart].filter((index) => index !== -1);
        const structureStart = candidateStarts.length > 0 ? Math.min(...candidateStarts) : -1;

        if (structureStart === -1) {
            const partialTagStart = findPartialStructuredTagTail(chunk, cursor);
            const partialCloseStart = findPartialStructuredCloseTail(chunk, cursor);
            const partialFenceStart = findPartialFenceTail(chunk, cursor);

            const partialCandidates = [partialTagStart, partialCloseStart, partialFenceStart]
                .filter((value) => value !== -1);
            const partialStart = partialCandidates.length > 0 ? Math.min(...partialCandidates) : -1;

            if (partialStart !== -1) {
                const text = chunk.slice(cursor, partialStart);
                if (text) {
                    result.blocks.push({ type: 'paragraph', content: text });
                    result.textToPrint += text;
                }
                result.carryoverBuffer = chunk.slice(partialStart);
                break;
            }

            const text = chunk.slice(cursor);
            if (text) {
                result.blocks.push({ type: 'paragraph', content: text });
                result.textToPrint += text;
            }
            break;
        }

        if (structureStart > cursor) {
            const text = chunk.slice(cursor, structureStart);
            result.blocks.push({ type: 'paragraph', content: text });
            result.textToPrint += text;
        }

        if (tagStart !== -1 && tagStart === structureStart) {
            const openTag = readStructuredTagAt(chunk, tagStart);
            if (!openTag) {
                const text = chunk.slice(structureStart, structureStart + 1);
                result.blocks.push({ type: 'paragraph', content: text });
                result.textToPrint += text;
                cursor = structureStart + 1;
                continue;
            }

            const closeTag = findClosingStructuredTag(chunk, openTag.tag, openTag.openEnd);
            const hasCloseTag = Boolean(closeTag);
            const bodyEnd = hasCloseTag && closeTag ? closeTag.start : chunk.length;
            const body = chunk.slice(openTag.openEnd, bodyEnd);
            extractStructuredBlock(openTag.tag, body, hasCloseTag, result, options);

            if (result.interrupt_requested) {
                break;
            }

            if (!hasCloseTag) {
                result.carryoverBuffer = chunk.slice(tagStart);
                break;
            }

            cursor = bodyEnd + (closeTag?.length ?? 0);
            if (cursor < chunk.length && chunk[cursor] === '\n') cursor += 1;
            continue;
        }

        const tagLineEnd = chunk.indexOf('\n', structureStart + 3);
        if (tagLineEnd === -1) {
            result.carryoverBuffer = chunk.slice(structureStart);
            break;
        }

        const rawTag = chunk.slice(structureStart + 3, tagLineEnd).trim().toLowerCase();
        const bodyStart = tagLineEnd + 1;

        const closeFence = findClosingFence(chunk, bodyStart);
        const hasCloseFence = closeFence !== -1;
        const bodyEnd = hasCloseFence ? closeFence : chunk.length;
        const body = chunk.slice(bodyStart, bodyEnd);
// Emit token trace for debugging parser token flow
    if (options?.sessionId) {
        ParserEngine.recordTokenTrace({
            sessionId: options.sessionId,
            at: Date.now(),
            sequenceNumber: tokenSequence,
            inputBytes: traceInputChunk.length,
            inputPreview: traceInputChunk.length > 0 ? traceInputChunk.slice(0, 300) : '(empty)',
            carryoverInputBytes: traceStartCarryover.length,
            carryoverPreview: traceStartCarryover.length > 0 ? traceStartCarryover.slice(0, 300) : '(none)',
            outputBlocks: result.blocks.length,
            outputEvents: result.events.length,
            outputTextBytes: result.textToPrint.length,
            outputTextPreview: result.textToPrint.length > 0 ? result.textToPrint.slice(0, 300) : '(empty)',
            outputCarryoverBytes: result.carryoverBuffer.length,
            outputCarryoverPreview: result.carryoverBuffer.length > 0 ? result.carryoverBuffer.slice(0, 300) : '(none)',
            interruptRequested: Boolean(result.interrupt_requested),
            interruptReason: result.interrupt_reason,
        });
    }

    
        extractStructuredBlock(rawTag, body, hasCloseFence, result, options);

        if (result.interrupt_requested) {
            break;
        }

        if (!hasCloseFence) {
            result.carryoverBuffer = chunk.slice(structureStart);
            break;
        }

        cursor = closeFence + 4;
        if (cursor < chunk.length && chunk[cursor] === '\n') cursor += 1;
    }

    return result;
}
