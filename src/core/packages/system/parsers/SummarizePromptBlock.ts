import { AIParserProtocolState, type AIHistoryEntry, type AISession } from '#/schemas/ai';
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
    name: 'summarize_prompt',
    slug: 'summarize_prompt',
    description: 'Stores a compact summary of a user prompt so future turns can remember the prompt meaning without replaying the full raw input.',
    block_schema: {
        is_default_detail: true,
        purpose: 'Use this block to compress a long user prompt into a durable turn-level prompt summary. Once stored, the prompt builder can inject that compact summary for the matching turn instead of replaying the full raw prompt.',
        requiredFields: '"action" (store) and "content".',
        optionalFields: '"turn_index" (defaults to current turn) and "payload".',
        triggerConditions: [
            'When the original user prompt is too large and should be compressed into a short durable summary.',
            'When future turns need to remember the meaning of a long user request without replaying the full raw prompt.',
            'When you want to preserve the user request semantically before the turn history becomes noisy or expensive.',
        ],
        promptExamples: [
            'Store a short summary of this user prompt for turn history.',
            'Compress the user request into a durable prompt summary before the turn gets too large.',
            'Summarize the current user request so future turns can remember it efficiently.',
        ],
        exampleLines: [
            '  @@ace:start summarize_prompt',
            '  {"action":"store","content":"User meminta audit parser streaming dan migrasi delimiter block ke @@ace:start/@@ace:end."}',
            '  @@ace:end',
        ],
    },
};

export const handlerComplete: ParserBlockHandler = async ({ block, dispatchParserResponse }: ParserBlockArgs) => {
    try {
        const payload = JSON.parse(block.payload.content);
        const action = payload.action;
        const content = payload.content;
        const session_uid = block.session_uid;

        const sessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
        if (!sessionState) {
            dispatchParserResponse(AIParserProtocolState.ERROR);
            return;
        }

        if (action !== 'store') {
            console.warn(`[SummarizePromptBlock] Unknown action: ${action}`);
            dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
            return;
        }

        if (typeof content !== 'string' || content.trim() === '') {
            console.warn(`[SummarizePromptBlock] 'store' requires non-empty string 'content'`);
            dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
            return;
        }

        const currentTurnIndex = sessionState.turn_index;
        const targetTurnIndex = Number.isFinite(Number(payload.turn_index))
            ? Number(payload.turn_index)
            : currentTurnIndex;
        const history = { ...(sessionState.history ?? {}) };
        const existingEntry = history[targetTurnIndex];

        const nextEntry: AIHistoryEntry = {
            at: Date.now(),
            turn_index: targetTurnIndex,
            status: 'active',
            lifecycle_turn: currentTurnIndex,
            prompt: content.trim(),
            response: existingEntry?.response,
            payload: {
                ...(existingEntry?.payload ?? {}),
                ...(payload.payload && typeof payload.payload === 'object' ? payload.payload : {}),
            },
        };

        history[targetTurnIndex] = nextEntry;

        const currentTurn = sessionState.turns[currentTurnIndex];
        currentTurn.assistant_renderers.push(
            TurnRenderer.buildRenderer(
                'history_summary_prompt_renderer',
                {
                    summary: content.trim(),
                    source: `turn:${targetTurnIndex}`,
                    turn_index: targetTurnIndex,
                    prompt_count: 1,
                },
            )
        );

        KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
            history,
            history_start_index: Math.max(0, targetTurnIndex - 15),
            history_end_index: Math.max(sessionState.history_end_index ?? 0, targetTurnIndex + 1),
            turns: [
                ...sessionState.turns.slice(0, currentTurnIndex),
                currentTurn,
            ],
        } as Partial<AISession>);

        dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
    } catch (e) {
        console.error(`[SummarizePromptBlock] Error processing block:`, e);
        dispatchParserResponse(AIParserProtocolState.ERROR);
    }
};