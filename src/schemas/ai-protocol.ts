import { z } from 'zod';

// ============================================================================
// AI STREAMING PROTOCOL SCHEMAS
// These schemas validate the intermediate objects parsed from the AI's 
// raw markdown streaming response.
// ============================================================================

/**
 * Validates the comma-separated header line immediately following the ```event tag.
 */
export const AITextBlockHeaderSchema = z.tuple([
    z.enum(['interaction', 'listener']),          // event_type
    z.string().describe('window_uid'),            // window_uid (the UI element)
    z.string().nullable().describe('process_uid'), // process_uid (the background executor, if any)
    z.string().nullable().describe('widget_uid'), // widget_uid (can be 'null' or empty)
    z.enum(['lookup', 'open', 'send', 'close', 'execute_tool', 'execute_storage']),  // action
    z.string(),                                   // sub_action
]);

/**
 * An intermediate state object representing an event block currently being buffered
 * from the live stream.
 */
export const BufferedAIEventSchema = z.object({
    headers: z.object({
        event_type: z.enum(['interaction', 'listener']),
        window_uid: z.string(),
        process_uid: z.string().optional(),
        widget_uid: z.string().optional(),
        action: z.enum(['lookup', 'open', 'send', 'close', 'execute_tool', 'execute_storage']),
        sub_action: z.string().optional(),
    }),

    /** The raw text accumulated between the headers and the end_event tag */
    raw_payload_buffer: z.string(),

    /** Becomes true the moment the parser encounters 'end_event' */
    is_complete: z.boolean().default(false),
});

export type BufferedAIEvent = z.infer<typeof BufferedAIEventSchema>;
