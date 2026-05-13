import { AIParserProtocolState } from '#/schemas/ai';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ParserBlockArgs, ParserBlockHandler } from '#/schemas/parser';

export const handlerStart: ParserBlockHandler = async ({ dispatchParserResponse }: ParserBlockArgs) => {
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};

export const handlerChunk: ParserBlockHandler = async ({ dispatchParserResponse }: ParserBlockArgs) => {
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};

export const registry: AceRegistryType.Parser = {
    name: 'parser_registry',
    slug: 'parser_registry',
    description: 'Compatibility block for parser-registry directives. LangGraph owns parser discovery policy; the frontend parser keeps this block only for stream compatibility.',
    block_schema: {
        is_default_detail: true,
        purpose: 'This block is parsed for compatibility, but parser-registry hydration is delegated to LangGraph. The frontend no longer writes working memory, context, or hydrated prompt state from streamed registry directives.',
        requiredFields: '"action" (must be "list_names", "list_hydrated", "detail", "activate", or "deactivate")',
        optionalFields: '"target_slug" (required if action is detail, activate, or deactivate)',
        triggerConditions: [
            'This is the required block whenever you need to know, inspect, verify, or discover parser blocks. Do not answer those questions from memory or from the hydrated subset alone.',
            'When you want to know what tools and features are available in this ACE instance.',
            'When you need to call a tool but don\'t know the exact block slug or the JSON payload schema.',
            'When you want to know which block details are currently hydrated into the prompt versus merely registered in the registry.',
            'When you want to load a specific block\'s instructions into your active context so you can use it in subsequent messages.',
            'When you want to clean up your prompt by deactivating block instructions you no longer need.',
            'If the task says list parser blocks, available parser blocks, all parser blocks, or what parser blocks exist, use action "list_names" and not "list_hydrated".',
            'Use action "list_hydrated" only when the task explicitly asks about which block details are currently injected into the prompt.',
        ],
        promptExamples: [
            'List all registered parser block names.',
            'What parser blocks exist in this ACE instance?',
            'Show me all available parser blocks, not just the hydrated ones.',
            'Show me which parser blocks are currently hydrated into the prompt.',
            'How do I use the file search block?',
            'Let me inspect the details of the execute_command block so I know the payload schema.',
            'I\'m done using the execute_command block. I will deactivate it.',
        ],
        exampleLines: [
            '  @@ace:start parser_registry',
            '  {"action": "list_names"}',
            '  @@ace:end',
            '',
            '  @@ace:start parser_registry',
            '  {"action": "list_hydrated"}',
            '  @@ace:end',
            '',
            '  @@ace:start parser_registry',
            '  {"action": "detail", "target_slug": "system:execute_command"}',
            '  @@ace:end',
            '',
            '  @@ace:start parser_registry',
            '  {"action": "activate", "target_slug": "system:context"}',
            '  @@ace:end',
        ],
    },
};

export const handlerComplete: ParserBlockHandler = async ({ block, dispatchParserResponse }: ParserBlockArgs) => {
    try {
        const payload = JSON.parse(block.payload.content);
        console.info('[ParserRegistryBlock] Delegated to LangGraph; frontend parser-registry mutations are disabled.', payload);
        dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);

    } catch (e) {
        console.error(`[ParserRegistryBlock] Error processing block:`, e);
        dispatchParserResponse(AIParserProtocolState.ERROR);
    }
};
