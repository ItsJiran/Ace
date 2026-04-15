import { AIParserProtocolState, type AISession } from '#/schemas/ai';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ParserBlockArgs, ParserBlockHandler } from '#/schemas/parser';
import { RegistryEngine } from '#/services/registryEngine';
import { KernelEngine } from '#/services/kernelEngine';
import * as TurnRenderer from '#/services/aiGateway/turnManager';

export const handlerStart: ParserBlockHandler = async ({ dispatchParserResponse }: ParserBlockArgs) => {
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};

export const handlerChunk: ParserBlockHandler = async ({ dispatchParserResponse }: ParserBlockArgs) => {
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};

export const registry: AceRegistryType.Parser = {
    name: 'parser_registry',
    slug: 'parser_registry',
    description: 'Allows dynamically listing available parser blocks or fetching full details (instructions, parameters) of a specific block to inject into the internal Context.',
    block_schema: {
        is_default_detail: true,
        purpose: 'Allows the AI to dynamically explore available features and parser blocks. You can list all available blocks to see what is possible, or request the full details of a specific block to learn its exact syntax and parameters. The details will automatically be injected into your active session context.',
        requiredFields: '"action" (must be "list", "detail", "activate", or "deactivate")',
        optionalFields: '"target_slug" (required if action is detail, activate, or deactivate)',
        triggerConditions: [
            'When you want to know what tools and features are available in this ACE instance.',
            'When you need to call a tool but don\'t know the exact block slug or the JSON payload schema.',
            'When you want to load a specific block\'s instructions into your active context so you can use it in subsequent messages.',
            'When you want to clean up your prompt by deactivating block instructions you no longer need.'
        ],
        promptExamples: [
            'What tools are available?',
            'What features do you have access to?',
            'How do I use the file search block?',
            'Let me inspect the details of the execute_command block so I know the payload schema.',
            'I\'m done using the execute_command block. I will deactivate it.',
        ],
        exampleLines: [
            '  @@ace:start parser_registry',
            '  {"action": "list"}',
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
        const action = payload.action;
        const session_uid = block.session_uid;

        const sessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
        if (!sessionState) {
            dispatchParserResponse(AIParserProtocolState.ERROR);
            return;
        }

        const currentTurnIndex = sessionState.turns.length > 0 ? sessionState.turns.length - 1 : 0;
        const wm = [...(sessionState.working_memory || [])];
        const newContextEntries = [...(sessionState.context || [])];

        if (action === 'list') {
            const allBlocks = RegistryEngine.listParserBlocks();
            const listContent = allBlocks.map(b => {
                const detail = RegistryEngine.renderParserBlockDetail(b.slug);
                return detail ? detail : `[${b.package_name}:${b.slug}] ${b.schema.purpose}`;
            }).join('\n\n');

            wm.filter(entry => entry.uid !== 'wm_parser_registry_list');
            wm.push({
                uid: 'wm_parser_registry_list',
                description: 'Full list of valid parser blocks from the registry',
                content: listContent,
                created_at: Date.now(),
                lifecycle_turn: currentTurnIndex,
            });

            // Push a UI renderer to show what we did
            const currentTurn = sessionState.turns[currentTurnIndex];
            currentTurn.assistant_renderers.push(
                TurnRenderer.buildRenderer('parser_registry_renderer', 'system', { action: 'list', count: allBlocks.length, data: listContent })
            );

            console.log(`[ParserRegistryBlock] Loaded full details of ${allBlocks.length} blocks for session ${session_uid} into working memory`);
            KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                working_memory: wm,
                feedback_loop_status: 'continue_requested',
                turns: [
                    ...sessionState.turns.slice(0, currentTurnIndex),
                    currentTurn
                ]
            } as Partial<AISession>);
            dispatchParserResponse(AIParserProtocolState.WAITING_FOR_FEEDBACK);
            return;
        }
        else if (action === 'detail') {
            const target = payload.target_slug;
            if (!target) {
                console.warn(`[ParserRegistryBlock] 'target_slug' is missing for detail action`);
                dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
                return;
            }

            const detail = RegistryEngine.renderParserBlockDetail(target);
            wm.filter(entry => entry.uid !== `wm_parser_detail_${target}`);
            wm.push({
                uid: `wm_parser_detail_${target}`,
                description: `Parser Block Details: ${target}`,
                content: detail || `Block with slug "${target}" was not found in the registry.`,
                created_at: Date.now(),
                lifecycle_turn: currentTurnIndex,
            });

            const currentTurn = sessionState.turns[currentTurnIndex];
            currentTurn.assistant_renderers.push(
                TurnRenderer.buildRenderer('parser_registry_renderer', 'system', { action: 'detail', target_slug: target, data: detail || `Block with slug "${target}" was not found in the registry.` })
            );

            console.log(`[ParserRegistryBlock] Loaded details for ${target} into working memory.`);
            KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, { 
                working_memory: wm, 
                feedback_loop_status: 'continue_requested',
                turns: [
                    ...sessionState.turns.slice(0, currentTurnIndex),
                    currentTurn
                ]
            } as Partial<AISession>);
            dispatchParserResponse(AIParserProtocolState.WAITING_FOR_FEEDBACK);
            return;
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

            newContextEntries.push({
                at: Date.now(),
                title: `Parser Block ${action === 'activate' ? 'Activated' : 'Deactivated'}: ${target}`,
                status: 'active',
                lifecycle_turn: currentTurnIndex,
                payload: { content: `The block "${target}" has been successfully ${action}d. Its full instructions will ${action === 'activate' ? 'now' : 'no longer'} be included in your system prompt.` }
            });

            const currentTurn = sessionState.turns[currentTurnIndex];
            currentTurn.assistant_renderers.push(
                TurnRenderer.buildRenderer('parser_registry_renderer', 'system', { action: action, target_slug: target })
            );

            KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                active_parser_blocks: activeBlocks,
                context: newContextEntries,
                context_end_index: newContextEntries.length,
                turns: [
                    ...sessionState.turns.slice(0, currentTurnIndex),
                    currentTurn
                ]
            } as Partial<AISession>);

            console.log(`[ParserRegistryBlock] Block ${target} ${action}d for session ${session_uid}`);
            dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
            return;
        }
        else {
            console.warn(`[ParserRegistryBlock] Unknown action: ${action}`);
            dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
        }

    } catch (e) {
        console.error(`[ParserRegistryBlock] Error processing block:`, e);
        dispatchParserResponse(AIParserProtocolState.ERROR);
    }
};
