import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ParserBlockArgs, ParserBlockHandler } from '#/schemas/parser';

export const registry: AceRegistryType.Parser = {
    name: 'context',
    slug: 'context',
    description: 'Session context management block — update summary, retrieve a stored memory, or store new information.',
    block_schema: {
        purpose: 'Manage persistent session context memory. Update the session summary, retrieve a stored memory by key, or store new information for future retrieval.',
        requiredFields: '"action" (update | retrieve | store). For update: one of "summary","context_summary","type":"summary_update". For retrieve: "memory_key". For store: "title","summary","payload".',
        optionalFields: '"result_memory_uid" (key to store retrieval result), "type", "text", "kind"',
        triggerConditions: [
            'AI accumulates conversational context that should be stored for session continuity',
            'AI needs to update the session summary after significant interactions',
            'AI retrieves previously stored context information to maintain conversation state',
            'AI saves important project/user details for later reference within the session',
            'Session context needs to be refreshed or modified based on user updates',
        ],
        promptExamples: [
            'Remember that we\'re working on the authentication module',
            'Update my context with the new requirements',
            'What have we discussed so far about the database schema?',
            'Store this configuration for the next session',
            'Retrieve the project goals we defined earlier',
            'Keep track of the user preferences I just learned',
        ],
        exampleLines: [
            '  <context>',
            '  {"action":"update","type":"summary_update","text":"User bernama Gilang, sedang mengerjakan proyek React."}',
            '  </context>',
            '',
            '  <context>',
            '  {"action":"retrieve","memory_key":"system:ai_context_rag:payload:some-uid","result_memory_uid":"system:session:abc:ctx_result:1"}',
            '  </context>',
            '',
            '  <context>',
            '  {"action":"store","title":"Project Details","summary":"User is building React app","payload":{"stack":["Vite","TypeScript","Tauri"]}}',
            '  </context>',
        ],
    },
};

export const handler: ParserBlockHandler = async ({ block, dispatchParserResponse } : ParserBlockArgs) => {
    const body = JSON.parse(block.payload.content);
    console.log(body);

    // For demonstration, we simply dispatch the parsed body back as the response.
    // In a real implementation, you would handle the different actions (update, retrieve, store) accordingly.
    dispatchParserResponse({
        action: 'continue',
    });
};
