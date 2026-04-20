import { AIParserProtocolState, type AISession, type AIWorkingMemoryEntry } from '#/schemas/ai';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ParserBlockArgs, ParserBlockHandler } from '#/schemas/parser';
import { RegistryEngine } from '#/services/registryEngine';
import { KernelEngine } from '#/services/kernelEngine';
import { AIGatewayEngine } from '#/services/aiGatewayEngine';
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
    description: 'Allows dynamically listing available parser blocks or fetching full details (instructions, parameters) of a specific block to inject into the internal context.',
    block_schema: {
        is_default_detail: true,
        purpose: 'Allows the AI to explore the full parser registry separately from the smaller subset of block details currently hydrated into the prompt. Registry reads may update working memory and should typically terminate the current streamed response so the backend graph can decide the next step.',
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
        const action = payload.action;
        const session_uid = block.session_uid;

        const sessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
        if (!sessionState) {
            dispatchParserResponse(AIParserProtocolState.ERROR);
            return;
        }

        const currentTurnIndex = sessionState.turn_index;
        const newContextEntries = [...(sessionState.context || [])];

        if (action === 'list_names' || action === 'list') {
            const allBlocks = RegistryEngine.listParserBlockSummaries();
            const names = allBlocks.map((block) => block.slug).sort((a, b) => a.localeCompare(b));
            const listContent = names.join('\n');

            const nextWorkingMemory = AIGatewayEngine.upsertWorkingMemoryEntry(sessionState, {
                uid: 'wm_parser_registry_names',
                description: 'Registered parser block names from the registry',
                content: listContent,
                created_at: Date.now(),
                lifecycle_turn: currentTurnIndex,
            } as AIWorkingMemoryEntry);

            const currentTurn = sessionState.turns[currentTurnIndex];
            const history = AIGatewayEngine.appendHistoryResponseSummary(
                sessionState,
                currentTurnIndex,
                `Parser registry names were loaded and stored in working memory entry wm_parser_registry_names.`,
                { working_memory_uid: 'wm_parser_registry_names', action: 'list_names' },
            );
            currentTurn.assistant_renderers.push(
                TurnRenderer.buildRenderer('parser_registry_renderer', 'system', { action: 'list_names', count: names.length, names })
            );

            console.log(`[ParserRegistryBlock] Loaded ${names.length} registered parser block names for session ${session_uid}`);
            KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                working_memory: nextWorkingMemory,
                history,
                history_end_index: Math.max(sessionState.history_end_index ?? 0, currentTurnIndex + 1),
                turns: [
                    ...sessionState.turns.slice(0, currentTurnIndex),
                    currentTurn
                ]
            } as Partial<AISession>);
            dispatchParserResponse(AIParserProtocolState.STOP_CURRENT_RESPONSE);
            return;
        }
        else if (action === 'list_hydrated') {
            const allBlocks = RegistryEngine.listParserBlockSummaries();
            const activeBlockSlugs = new Set((sessionState.active_parser_blocks ?? []).map((entry) => entry.block_slug));
            const hydratedBlocks = allBlocks
                .filter((block) => block.is_default_detail || activeBlockSlugs.has(block.slug))
                .map((block) => block.slug)
                .sort((a, b) => a.localeCompare(b));
            const listContent = hydratedBlocks.join('\n');

            const nextWorkingMemory = AIGatewayEngine.upsertWorkingMemoryEntry(sessionState, {
                uid: 'wm_parser_registry_hydrated',
                description: 'Parser block names whose details are currently hydrated into the prompt',
                content: listContent,
                created_at: Date.now(),
                lifecycle_turn: currentTurnIndex,
            } as AIWorkingMemoryEntry);

            const currentTurn = sessionState.turns[currentTurnIndex];
            const history = AIGatewayEngine.appendHistoryResponseSummary(
                sessionState,
                currentTurnIndex,
                `Hydrated parser block names were loaded and stored in working memory entry wm_parser_registry_hydrated.`,
                { working_memory_uid: 'wm_parser_registry_hydrated', action: 'list_hydrated' },
            );
            currentTurn.assistant_renderers.push(
                TurnRenderer.buildRenderer('parser_registry_renderer', 'system', { action: 'list_hydrated', count: hydratedBlocks.length, names: hydratedBlocks })
            );

            console.log(`[ParserRegistryBlock] Loaded ${hydratedBlocks.length} hydrated parser block names for session ${session_uid}`);
            KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                working_memory: nextWorkingMemory,
                history,
                history_end_index: Math.max(sessionState.history_end_index ?? 0, currentTurnIndex + 1),
                turns: [
                    ...sessionState.turns.slice(0, currentTurnIndex),
                    currentTurn
                ]
            } as Partial<AISession>);
            dispatchParserResponse(AIParserProtocolState.STOP_CURRENT_RESPONSE);
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
            const nextWorkingMemory = AIGatewayEngine.upsertWorkingMemoryEntry(sessionState, {
                uid: `wm_parser_detail_${target}`,
                description: `Parser Block Details: ${target}`,
                content: detail || `Block with slug "${target}" was not found in the registry.`,
                created_at: Date.now(),
                lifecycle_turn: currentTurnIndex,
            } as AIWorkingMemoryEntry);

            const currentTurn = sessionState.turns[currentTurnIndex];
            const history = AIGatewayEngine.appendHistoryResponseSummary(
                sessionState,
                currentTurnIndex,
                `Parser block detail for ${target} was stored in working memory entry wm_parser_detail_${target}.`,
                { working_memory_uid: `wm_parser_detail_${target}`, action: 'detail', target_slug: target },
            );
            currentTurn.assistant_renderers.push(
                TurnRenderer.buildRenderer('parser_registry_renderer', 'system', { action: 'detail', target_slug: target, data: detail || `Block with slug "${target}" was not found in the registry.` })
            );

            console.log(`[ParserRegistryBlock] Loaded details for ${target} into working memory.`);
            KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, { 
                working_memory: nextWorkingMemory, 
                history,
                history_end_index: Math.max(sessionState.history_end_index ?? 0, currentTurnIndex + 1),
                turns: [
                    ...sessionState.turns.slice(0, currentTurnIndex),
                    currentTurn
                ]
            } as Partial<AISession>);
            dispatchParserResponse(AIParserProtocolState.STOP_CURRENT_RESPONSE);
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
                content: `The block "${target}" has been successfully ${action}d. Its full instructions will ${action === 'activate' ? 'now' : 'no longer'} be included in your system prompt.`,
                status: 'active',
                lifecycle_turn: currentTurnIndex,
                payload: { block_slug: target, action }
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
