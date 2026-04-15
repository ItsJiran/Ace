import { AIParserProtocolState, type AISession } from '#/schemas/ai';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ParserBlockArgs, ParserBlockHandler } from '#/schemas/parser';
import { AIGatewayEngine } from '#/services/aiGatewayEngine';
import { KernelEngine } from '#/services/kernelEngine';
import * as TurnRenderer from '#/services/aiGateway/turnManager';

export const registry: AceRegistryType.Parser = {
    name: 'paragraph',
    slug: 'paragraph',
    description: 'Streams user-visible prose through a dedicated kernel memory slot and paragraph renderer.',
    block_schema: {
        is_default_detail: true,
        purpose: 'Use this block when you want visible prose to stream through a dedicated paragraph renderer instance instead of relying on plain text outside parser tags.',
        requiredFields: 'None. The content is the raw paragraph text inside the block.',
        optionalFields: 'If you need to mention ACE control markers literally, escape or rewrite them as plain explanation text.',
        triggerConditions: [
            'FOR EVERY PARAGRAPH, TEXT WRAP USING THIS BLOCK',
            'When you want a dedicated renderer-backed paragraph block with its own streaming lifecycle.',
            'When prose should be emitted through block mechanics so chunk updates can be observed independently from the raw assistant response.',
            'Do not put another parser block inside paragraph content. Close the paragraph first, then emit the next parser block.',
        ],
        promptExamples: [
            'Render this explanation as a dedicated paragraph block.',
            'Stream the visible answer through a paragraph renderer instance.',
            'If you need another parser block, end the paragraph first and open the next block on a new line.'
        ],
        exampleLines: [
            '  @@ace:start paragraph',
            '  This paragraph is streamed through kernel memory and rendered progressively.',
            '  @@ace:end',
            `Do not write nested control blocks inside paragraph. If you need to mention them literally, write text like "[at][at]ace:start tool_call" instead of opening a real block.`
        ],
    },
};

function buildParagraphMemoryUid(block: ParserBlockArgs['block']): string {
    return `system:ai_session:${block.session_uid}:turn:${block.turn_index}:entry:${block.entry_index}:block:${block.block_index}:paragraph`;
}

export const handlerStart: ParserBlockHandler = async ({ block, dispatchParserResponse }: ParserBlockArgs) => {
    const sessionState = KernelEngine.readMemory(`system:ai_session:${block.session_uid}:state`) as AISession;
    if (!sessionState) {
        dispatchParserResponse(AIParserProtocolState.ERROR);
        return;
    }

    const memory_uid = buildParagraphMemoryUid(block);
    block.runtime_context = {
        ...(block.runtime_context ?? {}),
        memory_uid,
    };

    KernelEngine.batch(() => {
        KernelEngine.createMemoryIfNotExist(memory_uid, '', sessionState.process_uid);

        const currentTurn = sessionState.turns[block.turn_index];
        currentTurn.assistant_renderers.push(
            TurnRenderer.buildRenderer('paragraph_renderer', { memory_uid })
        );

        KernelEngine.updateMemory(`system:ai_session:${block.session_uid}:state`, {
            turns: [
                ...sessionState.turns.slice(0, block.turn_index),
                currentTurn,
            ],
        } as Partial<AISession>);
    });

    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};

export const handlerChunk: ParserBlockHandler = async ({ block, chunk_text, dispatchParserResponse }: ParserBlockArgs) => {
    const memory_uid = typeof block.runtime_context?.memory_uid === 'string'
        ? block.runtime_context.memory_uid
        : buildParagraphMemoryUid(block);

    const currentText = (KernelEngine.readMemory(memory_uid) as string | undefined) ?? '';
    KernelEngine.writeMemory(memory_uid, `${currentText}${chunk_text ?? ''}`, block.process_uid);
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};

export const handlerComplete: ParserBlockHandler = async ({ block, dispatchParserResponse }: ParserBlockArgs) => {
    const sessionState = KernelEngine.readMemory(`system:ai_session:${block.session_uid}:state`) as AISession;
    if (!sessionState) {
        dispatchParserResponse(AIParserProtocolState.ERROR);
        return;
    }

    const paragraphText = (block.payload.content ?? '').trim();
    if (paragraphText !== '') {
        const history = AIGatewayEngine.appendHistoryResponseSummary(
            sessionState,
            block.turn_index,
            paragraphText,
            { action: 'paragraph' },
        );

        KernelEngine.updateMemory(`system:ai_session:${block.session_uid}:state`, {
            history,
            history_end_index: Math.max(sessionState.history_end_index ?? 0, block.turn_index + 1),
        } as Partial<AISession>);
    }

    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};
