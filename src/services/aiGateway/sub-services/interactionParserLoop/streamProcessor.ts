/**
 * Interaction Parser Loop Stream Processor
 *
 * Summary:
 * - consumes the gateway response stream chunk by chunk
 * - mirrors structured deepagent meta events into session state
 * - treats all remaining stream content as paragraph text
 *
 * Flow:
 * - append raw chunk to current entry and runtime buffer
 * - split transport-level deepagent meta frames from plain text
 * - render plain text directly and keep paragraph output primary
 */

import { AIParserProtocolState } from '#/schemas/ai';
import { ingestAgentRuntimeEvent } from './agentEventIngestor';
import { mirrorAgentRuntimeSnapshot, type AgentRuntimeSnapshotPayload } from './agentRuntimeMirror';
import { appendChunkToCurrentEntry } from './persistence';
import { flushPlainTextBufferToRenderer, renderStrippedPrefix } from './paragraphStream';
import { DEEPAGENT_STREAM_META_PREFIX, type StreamRuntimeState } from './shared';

export async function processGatewayStream(
    session_uid: string,
    reader: ReadableStreamDefaultReader<Uint8Array>,
    abortController: AbortController,
): Promise<AIParserProtocolState | undefined> {
    void abortController;

    const decoder = new TextDecoder();
    const runtimeState: StreamRuntimeState = {
        transport_buffer: '',
        pending_buffer: '',
        tmp_paragraph_renderer_index: -1,
        tmp_paragraph_memory_uid: undefined,
    };

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        await processGatewayChunk(session_uid, chunk, runtimeState, abortController);
    }

    if (runtimeState.pending_buffer !== '') {
        flushPlainTextBufferToRenderer(session_uid, runtimeState);
        runtimeState.pending_buffer = '';
    }

    return undefined;
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
            ingestAgentRuntimeEvent(session_uid, segment.payload);
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
    void abortController;

    if (chunk === '') {
        return AIParserProtocolState.CONTINUE_NEXT_BLOCK;
    }

    appendChunkToCurrentEntry(session_uid, chunk);
    runtimeState.pending_buffer += chunk;

    renderStrippedPrefix(session_uid, runtimeState.pending_buffer, runtimeState);
    runtimeState.pending_buffer = '';

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
            if (typeof parsed.type === 'string' && parsed.type.startsWith('deepagent_')) {
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