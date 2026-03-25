import type { BufferedAIEvent } from '../schemas/ai_protocol';
import { AITextBlockHeaderSchema } from '../schemas/ai_protocol';

/**
 * A single ordered segment of an AI response.
 *
 * The full response is a sequence of alternating text and event blocks, e.g.:
 *   [ { type:'text', … }, { type:'event', … }, { type:'text', … } ]
 *
 * This makes it possible for the UI to render each segment as its own bubble /
 * action card rather than collapsing all text into one undivided string.
 */
export type AIMessageBlock =
    | { type: 'text'; content: string }
    | { type: 'event'; event: BufferedAIEvent };

/**
 * Result of parsing a chunk of AI stream.
 *
 * blocks       — ordered sequence of text/event segments (primary output).
 * events       — flat array of all events (backward-compat convenience).
 * textToPrint  — all text segments concatenated (backward-compat convenience).
 */
export interface AIParseResult {
    blocks: AIMessageBlock[];
    events: BufferedAIEvent[];
    textToPrint: string;
}

export function parseAIStreamChunk(chunk: string): AIParseResult {
    const result: AIParseResult = {
        blocks: [],
        events: [],
        textToPrint: ''
    };

    // A robust regex to find the start of an event block, 
    // capturing the hallucination pattern where it might say ```json instead of ```event
    const blockRegex = /\n?```(?:event|json)\s*\n(.*?)\n([\s\S]*?)(?:\nend_event)?(?=\n?```|$)/g;

    let textCursor = 0;
    let match;

    while ((match = blockRegex.exec(chunk)) !== null) {
        const startIdx = match.index;
        const fullBlock = match[0];

        // 1. Add any preceding raw text to the textToPrint buffer
        if (startIdx > textCursor) {
            const textContent = chunk.substring(textCursor, startIdx);
            result.textToPrint += textContent;
            result.blocks.push({ type: 'text', content: textContent });
        }
        textCursor = startIdx + fullBlock.length;

        // 2. Extract Header Line vs Payload
        const headerLine = match[1].trim();
        const innerPayload = match[2];
        const hasEndEvent = fullBlock.includes('end_event');

        // 3. Parse and Validate Headers
        const headerParts = headerLine.split(',').map(s => s.trim());
        const headerValidation = AITextBlockHeaderSchema.safeParse(headerParts);

        if (!headerValidation.success) {
            // FAULT TOLERANCE: The LLM hallucinated the header syntax.
            // Abort parsing this block as an event, treat the whole match as raw text payload
            result.textToPrint += fullBlock;
            continue;
        }

        const [event_type, window_uid, process_uid_raw, widget_uid_raw, action, sub_action] = headerValidation.data;

        // 4. Construct the Intermediate Buffered Event
        const event: BufferedAIEvent = {
            headers: {
                event_type,
                window_uid,
                process_uid: (process_uid_raw === 'null' || process_uid_raw === null) ? undefined : process_uid_raw,
                widget_uid: (widget_uid_raw === 'null' || widget_uid_raw === null) ? undefined : widget_uid_raw,
                action,
                sub_action
            },
            raw_payload_buffer: hasEndEvent ? innerPayload.replace(/\n?end_event\s*$/, '') : innerPayload,
            is_complete: hasEndEvent
        };

        result.events.push(event);
        result.blocks.push({ type: 'event', event });
    }

    // Add any trailing raw text after all regex matches
    if (textCursor < chunk.length) {
        const trailingText = chunk.substring(textCursor);
        result.textToPrint += trailingText;
        result.blocks.push({ type: 'text', content: trailingText });
    }

    return result;
}
