import { beforeAll, describe, it, expect } from 'vitest';
import { parseAIStreamChunk } from '#/services/aiParser';
import { RegistryEngine } from '#/services/registryEngine';

describe('AI Stream Parser (Fault-Tolerant)', () => {
    beforeAll(async () => {
        RegistryEngine.registerPackage({
            manifest: {
                namespace: 'itsjiran/ace-system',
                package_name: 'itsjiran/ace-system',
                version: '1.0.0',
                owner_scope: 'core',
                source_scope: 'core',
            },
            domains: {
                parsers: {},
            },
        });

        RegistryEngine.registerPackageModules('itsjiran/ace-system', {
            '/src/core/packages/system/parsers/EventBlock.ts': await import('#/core/packages/system/parsers/EventBlock'),
            '/src/core/packages/system/parsers/ContextBlock.ts': await import('#/core/packages/system/parsers/ContextBlock'),
            '/src/core/packages/system/parsers/ToolBlock.ts': await import('#/core/packages/system/parsers/ToolBlock'),
            '/src/core/packages/system/parsers/StorageBlock.ts': await import('#/core/packages/system/parsers/StorageBlock'),
            '/src/core/packages/system/parsers/HistorySummaryPromptBlock.ts': await import('#/core/packages/system/parsers/HistorySummaryPromptBlock'),
            '/src/core/packages/system/parsers/HistorySummaryResponseBlock.ts': await import('#/core/packages/system/parsers/HistorySummaryResponseBlock'),
            '/src/core/packages/system/parsers/PresentationBlock.ts': await import('#/core/packages/system/parsers/PresentationBlock'),
        });
    });

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
        expect(result!.blocks.some((b) => b.block_slug === 'event')).toBe(true);
        expect(result!.blocks.some((b) => b.block_slug === 'paragraph')).toBe(true);

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
        expect(result?.blocks.some((b) => b.block_slug === 'paragraph')).toBe(true);
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
        expect(result!.blocks.some((b) => b.block_slug === 'event')).toBe(true);
    });

    it('should parse tool block with action, tool_slug, status and memory fields', () => {
        const streamChunk = `
Sebelum eksekusi tool.
<tool>
{
  "action": "execute",
  "tool_slug": "calendar.create",
  "package_ref": "itsjiran/ace-system",
  "status": "running",
  "memory_uid": "system:loop:tool:123",
  "result_memory_uid": "system:loop:tool:123:result"
}
</tool>
Setelah eksekusi tool.
`;

        const result = parseAIStreamChunk(streamChunk);
        const execBlock = result.blocks.find((b) => b.block_slug === 'tool');

        expect(execBlock).toBeDefined();
        if (execBlock && execBlock.block_slug === 'tool') {
            expect(execBlock.action).toBe('execute');
            expect(execBlock.tool_slug).toBe('calendar.create');
            expect(execBlock.package_ref).toBe('itsjiran/ace-system');
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
        const block = result.blocks.find((entry) => entry.block_slug === 'history_summary_ai_prompt');

        expect(block).toBeDefined();
        if (block && block.block_slug === 'history_summary_ai_prompt') {
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
        const block = result.blocks.find((entry) => entry.block_slug === 'history_summary_ai_response');

        expect(block).toBeDefined();
        if (block && block.block_slug === 'history_summary_ai_response') {
            expect(block.payload_json?.summary).toBe('Saya mengingat nama user adalah Gilang.');
            expect(block.payload_json?.memory_key).toBe('system:ai_context_rag:payload:ctxref-response');
            expect(block.payload_json?.ref_uid).toBe('ctxref-response');
        }
    });

    it('should parse storage block with action, memory_uid and default completed status', () => {
        const streamChunk = `
<storage>
{
  "action": "write",
  "memory_uid": "system:loop:storage:999"
}
</storage>
`;

        const result = parseAIStreamChunk(streamChunk);
        const block = result.blocks.find((b) => b.block_slug === 'storage');

        expect(block).toBeDefined();
        if (block && block.block_slug === 'storage') {
            expect(block.action).toBe('write');
            expect(block.memory_uid).toBe('system:loop:storage:999');
            expect(block.status).toBe('completed');
        }
    });

    it('should parse tool block when payload is accidentally wrapped by inner <tool> tag', () => {
        const streamChunk = `
<tool>
<tool>{"action":"list","status":"pending"}</tool>
</tool>
`;

        const result = parseAIStreamChunk(streamChunk);
        const block = result.blocks.find((b) => b.block_slug === 'tool');

        expect(block).toBeDefined();
        if (block && block.block_slug === 'tool') {
            expect(block.action).toBe('list');
            expect(block.status).toBe('pending');
            expect(block.payload_parse_error).toBeUndefined();
        }
    });

    it('should parse storage block when payload is wrapped by fenced json', () => {
        const streamChunk = `
<storage>

\`\`\`json
{"action":"read","memory_uid":"system:memory:abc"}
\`\`\`

</storage>
`;

        const result = parseAIStreamChunk(streamChunk);
        const block = result.blocks.find((b) => b.block_slug === 'storage');

        expect(block).toBeDefined();
        if (block && block.block_slug === 'storage') {
            expect(block.action).toBe('read');
            expect(block.memory_uid).toBe('system:memory:abc');
            expect(block.payload_parse_error).toBeUndefined();
        }
    });

    it('should keep context tag buffered until closing tag is found', () => {
        const streamChunk = `
<context>
{"type":"summary_update","text":"User bernama Gilang."}
Saya bantu?
`;

        const result = parseAIStreamChunk(streamChunk);
        const contextBlock = result.blocks.find((b) => b.block_slug === 'context');

        expect(contextBlock).toBeDefined();
        if (contextBlock && contextBlock.block_slug === 'context') {
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
        const block = result.blocks.find((entry) => entry.block_slug === 'history_summary_ai_response');

        expect(block).toBeDefined();
        if (block && block.block_slug === 'history_summary_ai_response') {
            expect(block.is_complete).toBe(false);
            expect(block.payload_json?.memory_key).toBe('system:ai_context_rag:payload:ctxref-response');
        }

        expect(result.carryoverBuffer).toContain('<history_summary_ai_response>');
    });

    it('should keep lone < as carryover and recover tool block in next chunk', () => {
        const chunk1 = '<';
        const result1 = parseAIStreamChunk(chunk1);

        expect(result1.carryoverBuffer).toBe('<');
        expect(result1.textToPrint).toBe('');

        const chunk2 = `${result1.carryoverBuffer}tool>\n{"action":"list","status":"pending"}\n</tool>`;
        const result2 = parseAIStreamChunk(chunk2);
        const toolBlock = result2.blocks.find((entry) => entry.block_slug === 'tool');

        expect(toolBlock).toBeDefined();
        if (toolBlock && toolBlock.block_slug === 'tool') {
            expect(toolBlock.action).toBe('list');
            expect(toolBlock.status).toBe('pending');
        }
    });

    it('should parse context retrieve action with memory pointers', () => {
        const streamChunk = `
<context>
{"action":"retrieve","memory_key":"system:ai_context_rag:payload:ctxref-123","result_memory_uid":"system:session:test:ctx_result:1"}
</context>
`;

        const result = parseAIStreamChunk(streamChunk);
        const contextBlock = result.blocks.find((b) => b.block_slug === 'context');

        expect(contextBlock).toBeDefined();
        if (contextBlock && contextBlock.block_slug === 'context') {
            expect(contextBlock.is_complete).toBe(true);
            expect(contextBlock.action).toBe('retrieve');
            expect(contextBlock.memory_key).toBe('system:ai_context_rag:payload:ctxref-123');
            expect(contextBlock.result_memory_uid).toBe('system:session:test:ctx_result:1');
        }
    });

    it('should parse presentation block with component reference', () => {
        const streamChunk = `
<presentation>
{"package_ref":"itsjiran/ace-system","component_slug":"ai_output_list","memory_uid":"system:session:test:tool_result:1","format":"list","props":{"title":"Results"}}
</presentation>
`;

        const result = parseAIStreamChunk(streamChunk);
        const presentationBlock = result.blocks.find((b) => b.block_slug === 'presentation');

        expect(presentationBlock).toBeDefined();
        if (presentationBlock && presentationBlock.block_slug === 'presentation') {
            expect(presentationBlock.is_complete).toBe(true);
            expect(presentationBlock.package_ref).toBe('itsjiran/ace-system');
            expect(presentationBlock.component_slug).toBe('ai_output_list');
            expect(presentationBlock.memory_uid).toBe('system:session:test:tool_result:1');
            expect(presentationBlock.format).toBe('list');
            expect((presentationBlock.props as Record<string, unknown>)?.title).toBe('Results');
        }
    });

});
