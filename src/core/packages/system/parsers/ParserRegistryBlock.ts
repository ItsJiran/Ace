import { AIParserProtocolState, type AISession, type AIContextEntry } from '#/schemas/ai';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ParserBlockArgs, ParserBlockHandler } from '#/schemas/parser';
import { RegistryEngine } from '#/services/registryEngine';
import { KernelEngine } from '#/services/kernelEngine';

export const registry: AceRegistryType.Parser = {
    name: 'parser_registry',
    slug: 'parser_registry',
    description: 'Interface for AI to discover and read details about available parser blocks within the system.',
    block_schema: {
        is_default_detail: true,
        purpose: 'Allows the AI to dynamically explore and active parser blocks. You can list all available blocks to see what is possible, request the full details of a specific block to learn its exact syntax, or "activate" a block so its instructions are permanently included in your system prompt.',
        requiredFields: '"action" (must be "list", "detail", "activate", or "deactivate")',
        optionalFields: '"target_slug" (required if action is NOT "list")',
        triggerConditions: [
            'When you want to know what tools or blocks are available to use',
            'When you see a block in the catalog but don\'t know how to format its payload',
            'When you want to activate a block so it is always available in your system prompt',
        ],
        promptExamples: [
            'What tools are available?',
            'Activate the "search" block so I can use it.',
        ],
        exampleLines: [
            '  <parser_registry>',
            '  {"action": "list"}',
            '  </parser_registry>',
            '',
            '  <parser_registry>',
            '  {"action": "activate", "target_slug": "system:context_update"}',
            '  </parser_registry>',
        ],
    },
};

export const handler: ParserBlockHandler = async ({ block, dispatchParserResponse }: ParserBlockArgs) => {
    try {
        const payload = JSON.parse(block.payload.content);
        const action = payload.action;
        const session_uid = block.session_uid;

        const sessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
        if (!sessionState) {
            dispatchParserResponse(AIParserProtocolState.ERROR);
            return;
        }

        const currentTurnIndex = sessionState.turns.length > 0 ? sessionState.turns.length - 1 : 0;
        const newContextEntries: AIContextEntry[] = [...(sessionState.context || [])];

        if (action === 'list') {
            const allBlocks = RegistryEngine.listParserBlocks();
            const listContent = allBlocks.map(b => {
                const detail = RegistryEngine.renderParserBlockDetail(b.slug);
                return detail ? detail : `[${b.package_name}:${b.slug}] ${b.schema.purpose}`;
            }).join('\n\n');

            newContextEntries.push({
                at: Date.now(),
                title: 'Parser Block Catalog (Full Details)',
                status: 'active',
                lifecycle_turn: currentTurnIndex,
                payload: { content: listContent }
            });

            console.log(`[ParserRegistryBlock] Loaded full details of ${allBlocks.length} blocks for session ${session_uid}`);
        }
        else if (action === 'detail') {
            const target = payload.target_slug;
            if (!target) {
                console.warn(`[ParserRegistryBlock] 'target_slug' is missing for detail action`);
                dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
                return;
            }

            const detail = RegistryEngine.renderParserBlockDetail(target);
            if (detail) {
                newContextEntries.push({
                    at: Date.now(),
                    title: `Parser Block Details: ${target}`,
                    status: 'active',
                    lifecycle_turn: currentTurnIndex,
                    payload: { content: detail }
                });
                console.log(`[ParserRegistryBlock] Loaded details for ${target} into session context.`);
            } else {
                newContextEntries.push({
                    at: Date.now(),
                    title: `Parser Block Details: ${target}`,
                    status: 'active',
                    lifecycle_turn: currentTurnIndex,
                    payload: { content: `Block with slug "${target}" was not found in the registry.` }
                });
            }
        }
        else if (action === 'activate' || action === 'deactivate') {
            const target = payload.target_slug;
            if (!target) {
                console.warn(`[ParserRegistryBlock] 'target_slug' is missing for ${action} action`);
                dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
                return;
            }

            let activeBlocks = [...(sessionState.active_parser_blocks || [])];

            if (action === 'activate') {
                if (!activeBlocks.some(b => b.block_slug === target)) {
                    activeBlocks.push({ block_slug: target });
                }
            } else {
                activeBlocks = activeBlocks.filter(b => b.block_slug !== target);
            }

            KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                active_parser_blocks: activeBlocks
            } as Partial<AISession>);

            newContextEntries.push({
                at: Date.now(),
                title: `Parser Block ${action === 'activate' ? 'Activated' : 'Deactivated'}: ${target}`,
                status: 'active',
                lifecycle_turn: currentTurnIndex,
                payload: { content: `The block "${target}" has been successfully ${action}d. Its full instructions will ${action === 'activate' ? 'now' : 'no longer'} be included in your system prompt.` }
            });
            console.log(`[ParserRegistryBlock] Block ${target} ${action}d for session ${session_uid}`);
        }
        else {
            console.warn(`[ParserRegistryBlock] Unknown action: ${action}`);
        }

        // Write the new context array back to memory
        KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
            context: newContextEntries,
            // Re-calculate the end index so the dynamic context is picked up immediately
            context_end_index: newContextEntries.length
        } as Partial<AISession>);

        dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
    } catch (e) {
        console.error(`[ParserRegistryBlock] Error processing block:`, e);
        dispatchParserResponse(AIParserProtocolState.ERROR);
    }
};
