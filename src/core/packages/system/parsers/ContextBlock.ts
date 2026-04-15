import { AIParserProtocolState, type AISession } from '#/schemas/ai';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ParserBlockArgs, ParserBlockHandler } from '#/schemas/parser';
import { KernelEngine } from '#/services/kernelEngine';
import * as TurnRenderer from '#/services/aiGateway/turnManager';

export const handlerStart: ParserBlockHandler = async ({ dispatchParserResponse }: ParserBlockArgs) => {
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};

export const handlerChunk: ParserBlockHandler = async ({ dispatchParserResponse }: ParserBlockArgs) => {
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};

export const registry: AceRegistryType.Parser = {
    name: 'context',
    slug: 'context',
    description: 'Session context management block — update summary, retrieve a stored memory, or store new information.',
    block_schema: {
        is_default_detail: true,
        purpose: 'Manage chaining-thought context memory. Store concise reasoning notes like user intent, current plan, or observed results, and list a specific context window by index range.',
        requiredFields: '"action" (store | list). For store: one of "content" | "text". For list: "start_index".',
        optionalFields: 'For store: "title", "kind", "payload". For list: "end_index".',
        triggerConditions: [
            'AI wants to remember an intermediate result such as "hasil dari x adalah y".',
            'AI wants to note the next intended action such as "sekarang saya akan melakukan x".',
            'AI wants to capture the user request or planning state as part of a lightweight reasoning chain.',
            'AI wants to focus the active context window to a specific stored range by index.',
        ],
        promptExamples: [
            'Store that the result of running migration X is success.',
            'Store that the user requested feature Y.',
            'Store the current plan before continuing to the next tool call.',
            'List context entries from index 3 until index 8.',
        ],
        exampleLines: [
            '  @@ace:start context',
            '  {"action":"store","title":"Observed Result","content":"Hasil dari pengecekan API ternyata statusnya 200."}',
            '  @@ace:end',
            '',
            '  @@ace:start context',
            '  {"action":"store","title":"Plan","content":"Sekarang saya akan melakukan validasi payload sebelum lanjut ke langkah berikutnya."}',
            '  @@ace:end',
            '',
            '  @@ace:start context',
            '  {"action":"list","start_index":0,"end_index":5}',
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
        const newContext = [...(sessionState.context || [])];
        const currentTurn = sessionState.turns[currentTurnIndex];

        if (action === 'store') {
            const content = payload.content || payload.text;
            if (!content || typeof content !== 'string') {
                console.warn(`[ContextBlock] 'store' requires one of 'content' or 'text'`);
                dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
                return;
            }

            const nextEntry = {
                at: Date.now(),
                title: payload.title || payload.kind || 'Context Note',
                content,
                status: 'active' as const,
                lifecycle_turn: currentTurnIndex,
                payload: payload.payload,
            };

            newContext.push({
                ...nextEntry,
            });

            currentTurn.assistant_renderers.push(
                TurnRenderer.buildRenderer('context_renderer', {
                    action: 'store',
                    title: nextEntry.title,
                    content: nextEntry.content,
                    kind: payload.kind,
                })
            );

            console.log(`[ContextBlock] Added context entry for session ${session_uid}`);
            const nextEndIndex = newContext.length - 1;
            KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                context: newContext,
                context_start_index: Math.max(0, nextEndIndex - 15),
                context_end_index: nextEndIndex,
                turns: [
                    ...sessionState.turns.slice(0, currentTurnIndex),
                    currentTurn,
                ],
            } as Partial<AISession>);
        } else if (action === 'list') {
            const rawStart = Number(payload.start_index);
            const rawEnd = payload.end_index === undefined ? newContext.length - 1 : Number(payload.end_index);

            if (!Number.isFinite(rawStart)) {
                console.warn(`[ContextBlock] 'list' requires numeric 'start_index'`);
                dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
                return;
            }

            const normalizedStart = Math.max(0, Math.min(newContext.length === 0 ? 0 : newContext.length - 1, rawStart));
            const normalizedEnd = Math.max(normalizedStart, Math.min(newContext.length === 0 ? 0 : newContext.length - 1, Number.isFinite(rawEnd) ? rawEnd : newContext.length - 1));
            const visibleCount = newContext.length === 0 ? 0 : (normalizedEnd - normalizedStart) + 1;

            currentTurn.assistant_renderers.push(
                TurnRenderer.buildRenderer('context_renderer', {
                    action: 'list',
                    start_index: normalizedStart,
                    end_index: normalizedEnd,
                    count: visibleCount,
                })
            );

            KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
                context_start_index: normalizedStart,
                context_end_index: normalizedEnd,
                turns: [
                    ...sessionState.turns.slice(0, currentTurnIndex),
                    currentTurn,
                ],
            } as Partial<AISession>);
        } else {
            console.warn(`[ContextBlock] Unknown action: ${action}`);
            dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
            return;
        }

        dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
    } catch (e) {
        console.error(`[ContextBlock] Error processing block:`, e);
        dispatchParserResponse(AIParserProtocolState.ERROR);
    }
};
