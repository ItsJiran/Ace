/**
 * Interaction Parser Loop Stream Processor
 *
 * Summary:
 * - consumes the gateway response stream chunk by chunk
 * - coordinates plain-text rendering, ACE block parsing, and lifecycle dispatch
 * - stops early when parser protocol requests interruption or loop continuation
 *
 * Flow:
 * - append raw chunk to current entry and runtime buffer
 * - if inside a block, stream content until a matching end sentinel is found
 * - if outside a block, render plain text or start a new parser block
 * - flush remaining plain text and abort unfinished blocks when the stream ends
 */

import { AIParserProtocolState } from '#/schemas/ai';
import { RegistryEngine } from '#/services/registryEngine';
import { mirrorAgentRuntimeSnapshot, type AgentRuntimeSnapshotPayload } from './agentRuntimeMirror';
import { appendChunkToCurrentEntry, appendContentToBlock, createStreamingBlock, getActiveBlockFromRuntime, markBlockCompleted } from './persistence';
import { abortActiveBlock, invokeBlockLifecycleHandler, shouldStopForParserProtocol } from './blockLifecycle';
import { flushPlainTextBufferToRenderer, renderStrippedPrefix, resetStreamingParagraphRuntime } from './paragraphStream';
import { findFirstAceStartSentinelIndex, parseAceStartHeader, scanActiveBlockBuffer, splitTrailingAceStartCandidate } from './bufferParsing';
import { DEEPAGENT_STREAM_META_PREFIX, type StreamRuntimeState } from './shared';

export async function processGatewayStream(
    session_uid: string,
    reader: ReadableStreamDefaultReader<Uint8Array>,
    abortController: AbortController,
): Promise<AIParserProtocolState | undefined> {
    const decoder = new TextDecoder();
    const runtimeState: StreamRuntimeState = {
        transport_buffer: '',
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
    runtimeState.transport_buffer += chunk;
    const extracted = extractTransportSegments(runtimeState.transport_buffer);
    runtimeState.transport_buffer = extracted.remainder;

    for (const segment of extracted.segments) {
        if (segment.kind === 'deepagent-meta') {
            mirrorAgentRuntimeSnapshot(session_uid, segment.payload, 'deepagent-stream');
            continue;
        }

        const protocolState = await processPlainTextChunk(session_uid, segment.text, runtimeState, abortController);
        if (protocolState !== AIParserProtocolState.CONTINUE_NEXT_BLOCK) {
            return protocolState;
        }
    }

    return AIParserProtocolState.CONTINUE_NEXT_BLOCK;
}

async function processPlainTextChunk(
    session_uid: string,
    chunk: string,
    runtimeState: StreamRuntimeState,
    abortController: AbortController,
): Promise<AIParserProtocolState> {
    if (chunk === '') {
        return AIParserProtocolState.CONTINUE_NEXT_BLOCK;
    }

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

type TransportSegment =
    | { kind: 'text'; text: string }
    | { kind: 'deepagent-meta'; payload: AgentRuntimeSnapshotPayload };

function extractTransportSegments(buffer: string): { segments: TransportSegment[]; remainder: string } {
    const segments: TransportSegment[] = [];
    let cursor = 0;

    while (cursor < buffer.length) {
        const metaStart = buffer.indexOf(DEEPAGENT_STREAM_META_PREFIX, cursor);
        if (metaStart === -1) {
            if (cursor < buffer.length) {
                segments.push({ kind: 'text', text: buffer.slice(cursor) });
            }
            return { segments, remainder: '' };
        }

        if (metaStart > cursor) {
            segments.push({ kind: 'text', text: buffer.slice(cursor, metaStart) });
        }

        const metaEnd = buffer.indexOf('\n', metaStart + DEEPAGENT_STREAM_META_PREFIX.length);
        if (metaEnd === -1) {
            return { segments, remainder: buffer.slice(metaStart) };
        }

        const rawPayload = buffer.slice(metaStart + DEEPAGENT_STREAM_META_PREFIX.length, metaEnd);
        try {
            const parsed = JSON.parse(rawPayload) as AgentRuntimeSnapshotPayload & { type?: string };
            if (parsed.type === 'deepagent_snapshot') {
                segments.push({ kind: 'deepagent-meta', payload: parsed });
            } else {
                segments.push({ kind: 'text', text: buffer.slice(metaStart, metaEnd + 1) });
            }
        } catch {
            segments.push({ kind: 'text', text: buffer.slice(metaStart, metaEnd + 1) });
        }

        cursor = metaEnd + 1;
    }

    return { segments, remainder: '' };
}