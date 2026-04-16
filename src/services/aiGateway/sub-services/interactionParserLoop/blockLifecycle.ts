import { AIParserProtocolState, type AIBlock, type AISession } from '#/schemas/ai';
import type { ParserBlockLifecycle } from '#/schemas/parser';
import { AIGatewayEngine } from '#/services/aiGatewayEngine';
import { KernelEngine } from '#/services/kernelEngine';
import { RegistryEngine } from '#/services/registryEngine';
import { AISessionBlockBus, type StreamRuntimeState } from './shared';
import { getActiveBlockFromRuntime, persistBlock } from './persistence';

export async function abortActiveBlock(
    session_uid: string,
    runtimeState: StreamRuntimeState,
    abortController: AbortController,
    reason: string,
): Promise<void> {
    const activeBlock = getActiveBlockFromRuntime(session_uid, runtimeState);
    if (!activeBlock) {
        runtimeState.active_block = undefined;
        return;
    }

    activeBlock.lifecycle_status = 'aborted';
    activeBlock.aborted_at = Date.now();
    activeBlock.updated_at = activeBlock.aborted_at;
    activeBlock.runtime_context = {
        ...(activeBlock.runtime_context ?? {}),
        abort_reason: reason,
    };

    persistBlock(session_uid, activeBlock);
    await invokeBlockLifecycleHandler(session_uid, activeBlock, 'abort', abortController);
    runtimeState.active_block = undefined;
}

export async function invokeBlockLifecycleHandler(
    session_uid: string,
    block: AIBlock,
    lifecycle: ParserBlockLifecycle,
    abortController: AbortController,
    chunkText?: string,
): Promise<AIParserProtocolState> {
    const currentSessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
    const historyEventIndex = ensureBlockHistoryEventIndex(session_uid, currentSessionState, block);
    const runtimeBlock = RegistryEngine.getParserBlock(block.block_slug);
    const lifecycleHandler = lifecycle === 'start'
        ? runtimeBlock?.handlers.start
        : lifecycle === 'chunk'
            ? runtimeBlock?.handlers.chunk
            : lifecycle === 'complete'
                ? runtimeBlock?.handlers.complete
                : runtimeBlock?.handlers.abort;

    if (!lifecycleHandler) {
        return lifecycle === 'complete' ? AIParserProtocolState.COMPLETED : AIParserProtocolState.CONTINUE_NEXT_BLOCK;
    }

    let hasParserResponse = false;
    let resolveParserState: ((value: AIParserProtocolState | undefined) => void) | undefined;
    const parserHandlerPromise = new Promise<AIParserProtocolState | undefined>((resolve) => {
        resolveParserState = resolve;
        AISessionBlockBus.addEventListener(
            `system:ai_session:${currentSessionState.session_uid}:block_parsing_response`,
            (e: Event) => {
                hasParserResponse = true;
                resolve((e as CustomEvent<AIParserProtocolState>).detail);
            },
            { once: true },
        );
    });

    const parserHandlerDispatch = (detail: AIParserProtocolState) => {
        AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${currentSessionState.session_uid}:block_parsing_response`, { detail }));
    };

    await lifecycleHandler({
        block,
        lifecycle,
        history_event_index: historyEventIndex,
        chunk_text: chunkText,
        dispatchParserResponse: parserHandlerDispatch,
        abortCurrentResponseBuffer: abortController.signal,
    });

    persistBlock(session_uid, block);
    finalizeBlockHistoryEvent(session_uid, block, lifecycle, historyEventIndex);

    if (!hasParserResponse) {
        resolveParserState?.(lifecycle === 'complete' ? AIParserProtocolState.COMPLETED : AIParserProtocolState.CONTINUE_NEXT_BLOCK);
    }

    return (await parserHandlerPromise) ?? AIParserProtocolState.CONTINUE_NEXT_BLOCK;
}

export function shouldStopForParserProtocol(protocolState: AIParserProtocolState): boolean {
    return protocolState === AIParserProtocolState.STOP_CURRENT_RESPONSE
        || protocolState === AIParserProtocolState.STOP_AND_CONTINUE_LOOP
        || protocolState === AIParserProtocolState.INTERRUPTED
        || protocolState === AIParserProtocolState.ERROR;
}

function ensureBlockHistoryEventIndex(session_uid: string, sessionState: AISession, block: AIBlock): number | undefined {
    const existingIndex = typeof block.runtime_context?.history_event_index === 'number'
        ? block.runtime_context.history_event_index
        : undefined;

    if (existingIndex !== undefined) {
        return existingIndex;
    }

    const { history, historyEventIndex } = AIGatewayEngine.allocateHistoryEventSlot(sessionState, block.turn_index, {
        block_slug: block.block_slug,
        entry_index: block.entry_index,
        block_index: block.block_index,
    });

    block.runtime_context = {
        ...(block.runtime_context ?? {}),
        history_event_index: historyEventIndex,
    };

    KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
        history,
        history_end_index: Math.max(sessionState.history_end_index ?? 0, block.turn_index + 1),
    } as Partial<AISession>);

    return historyEventIndex;
}

function finalizeBlockHistoryEvent(
    session_uid: string,
    block: AIBlock,
    lifecycle: ParserBlockLifecycle,
    historyEventIndex: number | undefined,
): void {
    if (historyEventIndex === undefined || (lifecycle !== 'complete' && lifecycle !== 'abort')) {
        return;
    }

    const sessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
    const historyEntry = sessionState.history?.[block.turn_index];
    const events = historyEntry?.responses ?? [];
    const event = events.find((item) => item.index === historyEventIndex);
    if (event?.summary?.trim()) {
        return;
    }

    const fallbackSummary = block.block_slug === 'paragraph'
        ? undefined
        : lifecycle === 'abort'
            ? `Block ${block.block_slug} aborted.`
            : `Block ${block.block_slug} completed.`;

    if (!fallbackSummary) {
        return;
    }

    const history = AIGatewayEngine.writeHistoryEventSummary(
        sessionState,
        block.turn_index,
        historyEventIndex,
        fallbackSummary,
        { auto_generated: true, block_slug: block.block_slug },
        { status: lifecycle === 'abort' ? 'aborted' : 'completed', block_slug: block.block_slug },
    );

    KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
        history,
        history_end_index: Math.max(sessionState.history_end_index ?? 0, block.turn_index + 1),
    } as Partial<AISession>);
}