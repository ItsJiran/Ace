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
    name: 'history',
    slug: 'history',
    description: 'Stores turn-level prompt or response summaries so future prompts can use compact history instead of replaying the full turn.',
    block_schema: {
        is_default_detail: true,
        purpose: 'Use this block to store a compact prompt or response summary for a turn. Once a history summary exists for that turn, the prompt builder can inject the summary instead of replaying the full raw prompt/response.',
        requiredFields: '"action" (store), "target" (prompt | response), and "content".',
        optionalFields: '"turn_index" (defaults to current turn) and "payload".',
        triggerConditions: [
            'When the original user prompt is too large and should be compressed into a short prompt summary.',
            'When the assistant response or chain of thought for a turn is long and should be summarized before the turn ends.',
            'When you want future turns to remember the outcome of a turn without replaying the whole raw conversation.',
        ],
        promptExamples: [
            'Store a short summary of this user prompt for turn history.',
            'Summarize the long response of this turn before ending it.',
            'Compress this completed turn into prompt/response history entries.',
        ],
        exampleLines: [
            '  @@ace:start history',
            '  {"action":"store","target":"prompt","content":"User meminta audit parser streaming dan migrasi delimiter block ke @@ace:start/@@ace:end."}',
            '  @@ace:end',
            '',
            '  @@ace:start history',
            '  {"action":"store","target":"response","content":"AI memigrasikan parser ke sentinel @@ace, memperbarui prompt builder, dan menormalkan renderer registry."}',
            '  @@ace:end',
        ],
    },
};

export const handlerComplete: ParserBlockHandler = async ({ block, dispatchParserResponse }: ParserBlockArgs) => {
    try {
        const payload = JSON.parse(block.payload.content);
        const action = payload.action;
        const target = payload.target;
        const content = payload.content;
        const session_uid = block.session_uid;

        const sessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
        if (!sessionState) {
            dispatchParserResponse(AIParserProtocolState.ERROR);
            return;
        }

        if (action !== 'store') {
            console.warn(`[HistoryBlock] Unknown action: ${action}`);
            dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
            return;
        }

        if (target !== 'prompt' && target !== 'response') {
            console.warn(`[HistoryBlock] 'store' requires target to be 'prompt' or 'response'`);
            dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
            return;
        }

        if (typeof content !== 'string' || content.trim() === '') {
            console.warn(`[HistoryBlock] 'store' requires non-empty string 'content'`);
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
            prompt: existingEntry?.prompt,
            response: existingEntry?.response,
            payload: {
                ...(existingEntry?.payload ?? {}),
                ...(payload.payload && typeof payload.payload === 'object' ? payload.payload : {}),
            },
        };

        if (target === 'prompt') {
            nextEntry.prompt = content.trim();
        } else {
            nextEntry.response = content.trim();
        }

        history[targetTurnIndex] = nextEntry;

        const currentTurn = sessionState.turns[currentTurnIndex];
        currentTurn.assistant_renderers.push(
            TurnRenderer.buildRenderer(
                target === 'prompt' ? 'history_summary_prompt_renderer' : 'history_summary_response_renderer',
                {
                    summary: content.trim(),
                    source: `turn:${targetTurnIndex}`,
                    turn_index: targetTurnIndex,
                    prompt_count: target === 'prompt' ? 1 : undefined,
                    response_count: target === 'response' ? 1 : undefined,
                },
            )
        );

        KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
            history,
            history_start_index: Math.max(0, targetTurnIndex - 15),
            history_end_index: Math.max(sessionState.history_end_index ?? 0, targetTurnIndex),
            turns: [
                ...sessionState.turns.slice(0, currentTurnIndex),
                currentTurn,
            ],
        } as Partial<AISession>);

        dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
    } catch (e) {
        console.error(`[HistoryBlock] Error processing block:`, e);
        dispatchParserResponse(AIParserProtocolState.ERROR);
    }
};