import { RegistryEngine } from './registryEngine';
import type {
    AIParseResult,
    ParserBlockRuntime,
} from '../schemas/parserBlocks';

export type {
    AIMessageBlock,
    AIParseResult,
    BaseBlock,
    BaseExecutionBlock,
    BlockProtocolSchema,
    ContextBlock,
    ExecutionBlockStatus,
    ExecutionBlockType,
    HistorySummaryBlock,
    ParserBlockRuntime,
} from '../schemas/parserBlocks';

export function buildBlockProtocolLines(): string {
    return RegistryEngine.buildParserBlockProtocolLines();
}

/** @deprecated Import buildBlockProtocolLines() to get an up-to-date catalog. */
export const AI_PARSER_BLOCK_PROTOCOL_LINES = buildBlockProtocolLines();

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

    const suffix = chunk.slice(lastLt).toLowerCase();
    const isPartial = /^<[a-z_][a-z0-9_]*$/i.test(suffix);

    return isPartial ? lastLt : -1;
}

function readStructuredTagAt(chunk: string, index: number): { tag: string; openEnd: number } | null {
    const matched = /^<([a-z_][a-z0-9_]*)>/i.exec(chunk.slice(index));
    if (!matched) {
        return null;
    }

    return {
        tag: matched[1].toLowerCase(),
        openEnd: index + matched[0].length,
    };
}

function findClosingStructuredTag(chunk: string, tag: string, bodyStart: number): number {
    return chunk.toLowerCase().indexOf(`</${tag}>`, bodyStart);
}

function extractStructuredBlock(
    tag: string,
    body: string,
    isComplete: boolean,
    result: AIParseResult,
) {
    const definition: ParserBlockRuntime | null = RegistryEngine.getParserBlock(tag);
    if (definition) {
        definition.handler({ tag, body, isComplete, result });
        return;
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

export function parseAIStreamChunk(chunk: string): AIParseResult {
    const result: AIParseResult = {
        blocks: [],
        events: [],
        textToPrint: '',
        carryoverBuffer: '',
    };

    let cursor = 0;

    while (cursor < chunk.length) {
        const fenceStart = chunk.indexOf('```', cursor);
        const tagStart = findNextStructuredTagStart(chunk, cursor);
        const candidateStarts = [fenceStart, tagStart].filter((index) => index !== -1);
        const structureStart = candidateStarts.length > 0 ? Math.min(...candidateStarts) : -1;

        if (structureStart === -1) {
            const partialTagStart = findPartialStructuredTagTail(chunk, cursor);
            if (partialTagStart !== -1) {
                const text = chunk.slice(cursor, partialTagStart);
                if (text) {
                    result.blocks.push({ type: 'paragraph', content: text });
                    result.textToPrint += text;
                }
                result.carryoverBuffer = chunk.slice(partialTagStart);
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

            const closeTagStart = findClosingStructuredTag(chunk, openTag.tag, openTag.openEnd);
            const hasCloseTag = closeTagStart !== -1;
            const bodyEnd = hasCloseTag ? closeTagStart : chunk.length;
            const body = chunk.slice(openTag.openEnd, bodyEnd);
            extractStructuredBlock(openTag.tag, body, hasCloseTag, result);

            if (!hasCloseTag) {
                result.carryoverBuffer = chunk.slice(tagStart);
                break;
            }

            cursor = closeTagStart + `</${openTag.tag}>`.length;
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

        extractStructuredBlock(rawTag, body, hasCloseFence, result);

        if (!hasCloseFence) {
            result.carryoverBuffer = chunk.slice(structureStart);
            break;
        }

        cursor = closeFence + 4;
        if (cursor < chunk.length && chunk[cursor] === '\n') cursor += 1;
    }

    return result;
}
