import { ACE_BLOCK_END_LINE, ACE_BLOCK_START_PREFIX } from './shared';

export function findFirstAceStartSentinelIndex(buffer: string): number {
    const match = /(^|\n)@@ace:start(?=[ \t]|$)/.exec(buffer);
    if (!match) return -1;

    return match.index + (match[1]?.length ?? 0);
}

export function parseAceStartHeader(buffer: string): {
    state: 'matched' | 'partial' | 'invalid';
    consumedLength: number;
    blockSlug?: string;
} {
    if (ACE_BLOCK_START_PREFIX.startsWith(buffer) && buffer.length < ACE_BLOCK_START_PREFIX.length) {
        return { state: 'partial', consumedLength: 0 };
    }
    if (!buffer.startsWith(ACE_BLOCK_START_PREFIX)) {
        return { state: 'invalid', consumedLength: consumeSingleLine(buffer) };
    }

    let cursor = ACE_BLOCK_START_PREFIX.length;
    if (cursor === buffer.length) return { state: 'partial', consumedLength: 0 };
    if (buffer[cursor] !== ' ' && buffer[cursor] !== '\t') {
        return { state: 'invalid', consumedLength: consumeSingleLine(buffer) };
    }

    while (cursor < buffer.length && (buffer[cursor] === ' ' || buffer[cursor] === '\t')) cursor += 1;
    if (cursor === buffer.length) return { state: 'partial', consumedLength: 0 };

    const slugMatch = /^([A-Za-z][\w:-]*)/.exec(buffer.slice(cursor));
    if (!slugMatch) return { state: 'invalid', consumedLength: consumeSingleLine(buffer) };

    const blockSlug = slugMatch[1];
    cursor += blockSlug.length;

    while (cursor < buffer.length && (buffer[cursor] === ' ' || buffer[cursor] === '\t')) cursor += 1;
    if (cursor === buffer.length) return { state: 'partial', consumedLength: 0 };
    if (buffer.startsWith('\r\n', cursor)) return { state: 'matched', consumedLength: cursor + 2, blockSlug };
    if (buffer[cursor] === '\n') return { state: 'matched', consumedLength: cursor + 1, blockSlug };

    return { state: 'invalid', consumedLength: consumeSingleLine(buffer), blockSlug };
}

export function splitTrailingAceStartCandidate(buffer: string): { flushableText: string; retainedCandidate: string } {
    const lastLineStart = Math.max(buffer.lastIndexOf('\n') + 1, 0);
    const trailingLine = buffer.slice(lastLineStart);

    if (!isPotentialAceStartLineFragment(trailingLine)) {
        return { flushableText: buffer, retainedCandidate: '' };
    }

    return {
        flushableText: buffer.slice(0, lastLineStart),
        retainedCandidate: trailingLine,
    };
}

export function scanActiveBlockBuffer(
    buffer: string,
    initialInsideFencedLiteral: boolean,
): {
    closingMatch: { startIndex: number; consumedLength: number } | null;
    flushableText: string;
    retainedCandidate: string;
    endingInsideFencedLiteral: boolean;
} {
    let insideFencedLiteral = initialInsideFencedLiteral;
    let cursor = 0;

    while (cursor < buffer.length) {
        const lineEndIndex = buffer.indexOf('\n', cursor);
        const lineHasNewline = lineEndIndex !== -1;
        const contentEnd = lineHasNewline ? lineEndIndex : buffer.length;
        const lineContent = buffer.slice(cursor, contentEnd).replace(/\r$/, '');
        const lineLength = contentEnd - cursor;
        const lineBreakLength = lineHasNewline ? 1 : 0;

        if (!insideFencedLiteral && isAceEndLine(lineContent)) {
            return {
                closingMatch: {
                    startIndex: cursor,
                    consumedLength: lineLength + lineBreakLength,
                },
                flushableText: buffer.slice(0, cursor),
                retainedCandidate: '',
                endingInsideFencedLiteral: insideFencedLiteral,
            };
        }

        if (isFenceLine(lineContent)) insideFencedLiteral = !insideFencedLiteral;

        if (!lineHasNewline) {
            const trailingLine = buffer.slice(cursor);
            const shouldRetain = insideFencedLiteral
                ? isPotentialFenceLineFragment(trailingLine)
                : isPotentialFenceLineFragment(trailingLine) || isPotentialAceEndLineFragment(trailingLine);

            return {
                closingMatch: null,
                flushableText: shouldRetain ? buffer.slice(0, cursor) : buffer,
                retainedCandidate: shouldRetain ? trailingLine : '',
                endingInsideFencedLiteral: insideFencedLiteral,
            };
        }

        cursor = contentEnd + lineBreakLength;
    }

    return {
        closingMatch: null,
        flushableText: buffer,
        retainedCandidate: '',
        endingInsideFencedLiteral: insideFencedLiteral,
    };
}

function isPotentialAceStartLineFragment(line: string): boolean {
    if (line === '') return false;
    if (ACE_BLOCK_START_PREFIX.startsWith(line)) return true;
    if (!line.startsWith(ACE_BLOCK_START_PREFIX)) return false;
    const rest = line.slice(ACE_BLOCK_START_PREFIX.length);
    return /^[ \t]+[A-Za-z]?[\w:-]*[ \t]*$/.test(rest);
}

function isAceEndLine(line: string): boolean {
    return /^@@ace:end[ \t]*$/.test(line);
}

function isFenceLine(line: string): boolean {
    return /^[ \t]*```[^\n\r]*$/.test(line);
}

function isPotentialFenceLineFragment(line: string): boolean {
    return /^[ \t]*`{1,2}$/.test(line);
}

function isPotentialAceEndLineFragment(line: string): boolean {
    if (line === '') return false;
    if (ACE_BLOCK_END_LINE.startsWith(line)) return true;
    if (!line.startsWith(ACE_BLOCK_END_LINE)) return false;
    const rest = line.slice(ACE_BLOCK_END_LINE.length);
    return /^[ \t]*$/.test(rest);
}

function consumeSingleLine(buffer: string): number {
    const newlineIndex = buffer.indexOf('\n');
    return newlineIndex === -1 ? buffer.length : newlineIndex + 1;
}