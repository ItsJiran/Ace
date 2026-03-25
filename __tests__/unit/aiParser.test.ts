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
        expect(result!.blocks.some((b) => b.type === 'event')).toBe(true);
        expect(result!.blocks.some((b) => b.type === 'paragraph')).toBe(true);

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
        expect(result?.blocks.some((b) => b.type === 'paragraph')).toBe(true);
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
        expect(result!.blocks.some((b) => b.type === 'event')).toBe(true);
    });

    it('should parse execute_tool block with status and memory fields', () => {
        const streamChunk = `
Sebelum eksekusi tool.
\`\`\`execute_tool
{
  "tool": "calendar.create",
  "status": "running",
  "memory_uid": "system:loop:tool:123",
  "result_memory_uid": "system:loop:tool:123:result"
}
\`\`\`
Setelah eksekusi tool.
`;

        const result = parseAIStreamChunk(streamChunk);
        const execBlock = result.blocks.find((b) => b.type === 'execute_tool');

        expect(execBlock).toBeDefined();
        if (execBlock && execBlock.type === 'execute_tool') {
            expect(execBlock.operation).toBe('calendar.create');
            expect(execBlock.status).toBe('running');
            expect(execBlock.memory_uid).toBe('system:loop:tool:123');
            expect(execBlock.result_memory_uid).toBe('system:loop:tool:123:result');
            expect(execBlock.is_complete).toBe(true);
        }
    });

    it('should parse execute_storage block and default status from completion', () => {
        const streamChunk = `
\`\`\`execute_storage
{
  "operation": "write_memory",
  "memory_uid": "system:loop:storage:999"
}
\`\`\`
`;

        const result = parseAIStreamChunk(streamChunk);
        const block = result.blocks.find((b) => b.type === 'execute_storage');

        expect(block).toBeDefined();
        if (block && block.type === 'execute_storage') {
            expect(block.operation).toBe('write_memory');
            expect(block.memory_uid).toBe('system:loop:storage:999');
            expect(block.status).toBe('completed');
        }
    });
});
