import { AIParserProtocolState, type AISession } from '#/schemas/ai';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ParserBlockArgs, ParserBlockHandler } from '#/schemas/parser';
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
        optionalFields: 'None.',
        triggerConditions: [
            'When you want a dedicated renderer-backed paragraph block with its own streaming lifecycle.',
            'When prose should be emitted through block mechanics so chunk updates can be observed independently from the raw assistant response.',
        ],
        promptExamples: [
            'Render this explanation as a dedicated paragraph block.',
            'Stream the visible answer through a paragraph renderer instance.'
        ],
        exampleLines: [
            '  <paragraph>',
            '  This paragraph is streamed through kernel memory and rendered progressively.',
            '  </paragraph>',
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
            TurnRenderer.buildRenderer('paragraph-renderer', 'system', { memory_uid })
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

export const handlerComplete: ParserBlockHandler = async ({ dispatchParserResponse }: ParserBlockArgs) => {
    dispatchParserResponse(AIParserProtocolState.CONTINUE_NEXT_BLOCK);
};
