import { AIParserProtocolState } from '#/schemas/ai';
import { RegistryEngine } from '#/services/registryEngine';
import { appendChunkToCurrentEntry, appendContentToBlock, createStreamingBlock, getActiveBlockFromRuntime, markBlockCompleted } from './persistence';
import { abortActiveBlock, invokeBlockLifecycleHandler, shouldStopForParserProtocol } from './blockLifecycle';
import { flushPlainTextBufferToRenderer, renderStrippedPrefix, resetStreamingParagraphRuntime } from './paragraphStream';
import { findFirstAceStartSentinelIndex, parseAceStartHeader, scanActiveBlockBuffer, splitTrailingAceStartCandidate } from './bufferParsing';
import type { StreamRuntimeState } from './shared';

export async function processGatewayStream(
    session_uid: string,
    reader: ReadableStreamDefaultReader<Uint8Array>,
    abortController: AbortController,
): Promise<AIParserProtocolState | undefined> {
    const decoder = new TextDecoder();
    const runtimeState: StreamRuntimeState = {
        pending_buffer: '',
        tmp_paragraph_renderer_index: -1,
        tmp_paragraph_memory_uid: undefined,
    };
    let terminalProtocolState: AIParserProtocolState | undefined;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const protocolState = await processGatewayChunk(session_uid, chunk, runtimeState, abortController);

        if (protocolState === AIParserProtocolState.ERROR) {
            throw new Error(`Parser protocol entered error state while streaming session ${session_uid}`);
        }

        if (
            protocolState === AIParserProtocolState.STOP_CURRENT_RESPONSE
            || protocolState === AIParserProtocolState.STOP_AND_CONTINUE_LOOP
            || protocolState === AIParserProtocolState.INTERRUPTED
        ) {
            terminalProtocolState = protocolState;
            runtimeState.pending_buffer = '';

            try {
                await reader.cancel(`Parser requested ${protocolState}`);
            } catch (error) {
                console.warn(`[AIGatewayEngine] Failed to cancel gateway reader for session ${session_uid}:`, error);
            }

            if (!abortController.signal.aborted) {
                abortController.abort();
            }

            break;
        }
    }

    if (runtimeState.active_block) {
        await abortActiveBlock(session_uid, runtimeState, abortController, 'Stream ended before block end marker');
    }

    if (runtimeState.pending_buffer !== '') {
        flushPlainTextBufferToRenderer(session_uid, runtimeState);
        runtimeState.pending_buffer = '';
    }

    return terminalProtocolState;
}

export async function processGatewayChunk(
    session_uid: string,
    chunk: string,
    runtimeState: StreamRuntimeState,
    abortController: AbortController,
): Promise<AIParserProtocolState> {
    appendChunkToCurrentEntry(session_uid, chunk);
    runtimeState.pending_buffer += chunk;

    while (runtimeState.pending_buffer !== '') {
        if (runtimeState.active_block) {
            const activeBlock = getActiveBlockFromRuntime(session_uid, runtimeState);
            if (!activeBlock) {
                runtimeState.active_block = undefined;
                continue;
            }

            const scanResult = scanActiveBlockBuffer(
                runtimeState.pending_buffer,
                runtimeState.active_block.inside_fenced_literal,
            );
            runtimeState.active_block.inside_fenced_literal = scanResult.endingInsideFencedLiteral;

            const closingMatch = scanResult.closingMatch;
            if (!closingMatch) {
                const chunkText = scanResult.flushableText;
                runtimeState.pending_buffer = scanResult.retainedCandidate;

                if (chunkText !== '') {
                    appendContentToBlock(session_uid, activeBlock, chunkText);
                    const protocolState = await invokeBlockLifecycleHandler(session_uid, activeBlock, 'chunk', abortController, chunkText);
                    if (shouldStopForParserProtocol(protocolState)) {
                        await abortActiveBlock(session_uid, runtimeState, abortController, 'Parser halted during chunk lifecycle');
                        return protocolState;
                    }
                }

                break;
            }

            const chunkText = runtimeState.pending_buffer.slice(0, closingMatch.startIndex);
            runtimeState.pending_buffer = runtimeState.pending_buffer.slice(closingMatch.startIndex + closingMatch.consumedLength);

            if (chunkText !== '') {
                appendContentToBlock(session_uid, activeBlock, chunkText);
                const chunkState = await invokeBlockLifecycleHandler(session_uid, activeBlock, 'chunk', abortController, chunkText);
                if (shouldStopForParserProtocol(chunkState)) {
                    await abortActiveBlock(session_uid, runtimeState, abortController, 'Parser halted during chunk lifecycle');
                    return chunkState;
                }
            }

            const completedBlock = markBlockCompleted(session_uid, activeBlock);
            const completeState = await invokeBlockLifecycleHandler(session_uid, completedBlock, 'complete', abortController);
            runtimeState.active_block = undefined;

            if (shouldStopForParserProtocol(completeState)) {
                return completeState;
            }

            continue;
        }

        const firstStartIndex = findFirstAceStartSentinelIndex(runtimeState.pending_buffer);
        if (firstStartIndex === -1) {
            const { flushableText, retainedCandidate } = splitTrailingAceStartCandidate(runtimeState.pending_buffer);
            if (flushableText !== '') {
                renderStrippedPrefix(session_uid, flushableText, runtimeState);
            }

            runtimeState.pending_buffer = retainedCandidate;
            break;
        }

        if (firstStartIndex > 0) {
            const plainText = runtimeState.pending_buffer.slice(0, firstStartIndex);
            runtimeState.pending_buffer = runtimeState.pending_buffer.slice(firstStartIndex);
            renderStrippedPrefix(session_uid, plainText, runtimeState);
            continue;
        }

        const startHeader = parseAceStartHeader(runtimeState.pending_buffer);
        if (startHeader.state === 'partial') {
            break;
        }

        if (startHeader.state === 'invalid' || !startHeader.blockSlug || !RegistryEngine.getParserBlock(startHeader.blockSlug)) {
            const plainText = runtimeState.pending_buffer.slice(0, startHeader.consumedLength);
            runtimeState.pending_buffer = runtimeState.pending_buffer.slice(startHeader.consumedLength);
            renderStrippedPrefix(session_uid, plainText, runtimeState);
            continue;
        }

        const blockSlug = startHeader.blockSlug;
        runtimeState.pending_buffer = runtimeState.pending_buffer.slice(startHeader.consumedLength);
        resetStreamingParagraphRuntime(runtimeState);

        const startedBlock = createStreamingBlock(session_uid, blockSlug);
        runtimeState.active_block = {
            block_slug: blockSlug,
            block_index: startedBlock.block_index,
            inside_fenced_literal: false,
        };

        const startState = await invokeBlockLifecycleHandler(session_uid, startedBlock, 'start', abortController);
        if (shouldStopForParserProtocol(startState)) {
            await abortActiveBlock(session_uid, runtimeState, abortController, 'Parser halted during start lifecycle');
            return startState;
        }
    }

    return AIParserProtocolState.CONTINUE_NEXT_BLOCK;
}