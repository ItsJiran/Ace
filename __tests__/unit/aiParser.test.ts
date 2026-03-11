import { describe, it, expect } from 'vitest';
import { parseAIStreamChunk } from '#/services/aiParser';

describe('AI Stream Parser (Fault-Tolerant)', () => {
    it('should successfully parse a perfect markdown event block', () => {
        const streamChunk = `
Here is a message for you.
\`\`\`event
interaction, null, main_window, null, open, open_tab
{ "tab_id": "search_view" }
end_event
`;
        const result = parseAIStreamChunk(streamChunk);

        expect(result).toBeDefined();
        expect(result?.events.length).toBe(1);

        const event = result!.events[0];
        expect(event.is_complete).toBe(true);
        expect(event.headers.event_type).toBe('interaction');
        expect(event.headers.action).toBe('open');
        expect(event.headers.sub_action).toBe('open_tab');

        // Assert the payload buffer was captured
        const payload = JSON.parse(event.raw_payload_buffer);
        expect(payload.tab_id).toBe('search_view');
    });

    it('should buffer an incomplete event and return is_complete: false', () => {
        const partialChunk = `
\`\`\`event
interaction, null, main_window, null, send, chat_response
{ "text": "This is half a`;

        const result = parseAIStreamChunk(partialChunk);

        expect(result?.events.length).toBe(1);
        const event = result!.events[0];

        expect(event.is_complete).toBe(false);
        expect(event.headers.action).toBe('send');
        expect(event.raw_payload_buffer.trim()).toBe('{ "text": "This is half a');
    });

    it('should gracefully abort and return raw text if headers are malformed', () => {
        const hallucinatedChunk = `
\`\`\`event
interaction, bad format missing commas
{ "data": true }
end_event
`;
        const result = parseAIStreamChunk(hallucinatedChunk);

        // It should reject the invalid headers, and return the raw text to print to the screen
        expect(result?.events.length).toBe(0);
        expect(result?.textToPrint).toContain('interaction, bad format');
    });

    it('should gracefully handle hallucinated json string tag instead of event tag', () => {
        const hallucinatedChunk = `
\`\`\`json
interaction, null, main_window, null, close, close_tab
{ "force": true }
end_event
`;
        // The parser should be smart enough to recognize the header structure even if the tag was wrong
        const result = parseAIStreamChunk(hallucinatedChunk);

        expect(result?.events.length).toBe(1);
        expect(result!.events[0].headers.action).toBe('close');
        expect(result!.events[0].is_complete).toBe(true);
    });
});
