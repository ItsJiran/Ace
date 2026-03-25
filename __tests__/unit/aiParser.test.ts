import { describe, it, expect } from 'vitest';
import { parseAIStreamChunk } from '#/services/aiParser';

describe('AI Stream Parser (Fault-Tolerant)', () => {
    it('should successfully parse a perfect tagged event block', () => {
        const streamChunk = `
Here is a message for you.
<event>
interaction, null, main_window, null, open, open_tab
{ "tab_id": "search_view" }
end_event
 </event>
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
<event>
interaction, null, main_window, null, send, chat_response
{ "text": "This is half a`;

        const result = parseAIStreamChunk(partialChunk);

        expect(result?.events.length).toBe(1);
        const event = result!.events[0];

        expect(event.is_complete).toBe(false);
        expect(event.headers.action).toBe('send');
        expect(event.raw_payload_buffer.trim()).toBe('{ "text": "This is half a');
    });

    it('should buffer incomplete opening tag and not print it as paragraph', () => {
        const partialChunk = 'Halo\n<context';
        const result = parseAIStreamChunk(partialChunk);

        expect(result.textToPrint).toContain('Halo\n');
        expect(result.textToPrint).not.toContain('<context');
        expect(result.carryoverBuffer).toBe('<context');
    });

    it('should gracefully abort and return raw text if headers are malformed', () => {
        const hallucinatedChunk = `
<event>
interaction, bad format missing commas
{ "data": true }
end_event
 </event>
`;
        const result = parseAIStreamChunk(hallucinatedChunk);

        // It should reject the invalid headers, and return the raw text to print to the screen
        expect(result?.events.length).toBe(0);
        expect(result?.textToPrint).toContain('interaction, bad format');
        expect(result?.blocks.some((b) => b.type === 'paragraph')).toBe(true);
    });

    it('should gracefully handle hallucinated json string tag instead of event tag', () => {
        const hallucinatedChunk = `
<json>
interaction, null, main_window, null, close, close_tab
{ "force": true }
end_event
 </json>
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
<execute_tool>
{
  "tool": "calendar.create",
  "status": "running",
  "memory_uid": "system:loop:tool:123",
  "result_memory_uid": "system:loop:tool:123:result"
}
</execute_tool>
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

    it('should parse hidden history summary prompt block as structured JSON', () => {
        const streamChunk = `
<history_summary_ai_prompt>
{"summary":"User ingin dibuatkan ringkasan todo.","memory_key":"system:ai_context_rag:payload:ctxref-prompt","ref_uid":"ctxref-prompt"}
</history_summary_ai_prompt>
Saya bantu membuatkan todo.
`;

        const result = parseAIStreamChunk(streamChunk);
        const block = result.blocks.find((entry) => entry.type === 'history_summary_ai_prompt');

        expect(block).toBeDefined();
        if (block && block.type === 'history_summary_ai_prompt') {
            expect(block.is_complete).toBe(true);
            expect(block.payload_json?.summary).toBe('User ingin dibuatkan ringkasan todo.');
            expect(block.payload_json?.memory_key).toBe('system:ai_context_rag:payload:ctxref-prompt');
            expect(block.payload_json?.ref_uid).toBe('ctxref-prompt');
        }

        expect(result.textToPrint).toContain('Saya bantu membuatkan todo.');
        expect(result.textToPrint).not.toContain('history_summary_ai_prompt');
    });

    it('should canonicalize history summary response binding aliases', () => {
        const streamChunk = `
<history_summary_ai_response>
{"content":"Saya mengingat nama user adalah Gilang.","memory_uid":"system:ai_context_rag:payload:ctxref-response","reference_uid":"ctxref-response"}
</history_summary_ai_response>
`;

        const result = parseAIStreamChunk(streamChunk);
        const block = result.blocks.find((entry) => entry.type === 'history_summary_ai_response');

        expect(block).toBeDefined();
        if (block && block.type === 'history_summary_ai_response') {
            expect(block.payload_json?.summary).toBe('Saya mengingat nama user adalah Gilang.');
            expect(block.payload_json?.memory_key).toBe('system:ai_context_rag:payload:ctxref-response');
            expect(block.payload_json?.ref_uid).toBe('ctxref-response');
        }
    });

    it('should parse execute_storage block and default status from completion', () => {
        const streamChunk = `
<execute_storage>
{
  "operation": "write_memory",
  "memory_uid": "system:loop:storage:999"
}
</execute_storage>
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

    it('should keep context tag buffered until closing tag is found', () => {
        const streamChunk = `
<context>
{"type":"summary_update","text":"User bernama Gilang."}
Saya bantu?
`;

        const result = parseAIStreamChunk(streamChunk);
        const contextBlock = result.blocks.find((b) => b.type === 'context');

        expect(contextBlock).toBeDefined();
        if (contextBlock && contextBlock.type === 'context') {
            expect(contextBlock.is_complete).toBe(false);
        }

        // No closing tag yet: keep whole segment in carryover and do not print
        // trailing prose to user text stream.
        expect(result.textToPrint).not.toContain('Saya bantu?');
        expect(result.carryoverBuffer).toContain('<context>');
    });

    it('should keep history summary response tag buffered until closing tag exists', () => {
        const streamChunk = `
<history_summary_ai_response>
{"summary":"Saya mengerjakan permintaan user.","memory_key":"system:ai_context_rag:payload:ctxref-response"}
`;

        const result = parseAIStreamChunk(streamChunk);
        const block = result.blocks.find((entry) => entry.type === 'history_summary_ai_response');

        expect(block).toBeDefined();
        if (block && block.type === 'history_summary_ai_response') {
            expect(block.is_complete).toBe(false);
            expect(block.payload_json?.memory_key).toBe('system:ai_context_rag:payload:ctxref-response');
        }

        expect(result.carryoverBuffer).toContain('<history_summary_ai_response>');
    });
});
