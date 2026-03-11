import type { BufferedAIEvent } from '../schemas/ai_protocol';
import { AITextBlockHeaderSchema } from '../schemas/ai_protocol';

/**
 * Result of parsing a chunk of AI stream.
 * events: An array of successfully parsed event blocks (some might be incomplete if buffering).
 * textToPrint: Any raw text outside of event blocks that should be printed to the UI normally.
 */
export interface AIParseResult {
    events: BufferedAIEvent[];
    textToPrint: string;
}

export function parseAIStreamChunk(chunk: string): AIParseResult {
    const result: AIParseResult = {
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
            result.textToPrint += chunk.substring(textCursor, startIdx);
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
    }

    // Add any trailing raw text after all regex matches
    if (textCursor < chunk.length) {
        result.textToPrint += chunk.substring(textCursor);
    }

    return result;
}
