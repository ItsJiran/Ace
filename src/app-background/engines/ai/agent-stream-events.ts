import { extractAgentStreamEvent, type EmitProtocolThreadEvent } from './stream';
import { XmlStreamParser } from '../../../shared/lib/xml-stream-parser';

/**
 * Per-run XML stream parsers for intercepting content-block-delta and
 * converting raw text into ace_tag_* structured events.
 */
const structuredParsers = new Map<string, {
    parser: XmlStreamParser;
    seq: number;
    node: string;
}>();

/**
 * Bridges raw LangGraph stream events into the desktop thread protocol.
 *
 * Intercepts content-block-delta: buffers text through XmlStreamParser
 * and emits ace_tag_{start,delta,end} events instead of raw deltas.
 */
export function createAIStreamEventBridge(input: {
    threadUid: string;
    emitProtocolThreadEvent: EmitProtocolThreadEvent;
}) {
    const { threadUid, emitProtocolThreadEvent } = input;
    console.info('[AIStreamBridge] created', { threadUid });

    return async (stream: any) => {
        for await (const event of stream) {
            const normalized_event = extractAgentStreamEvent(event);

            console.log('[AIStreamBridge] emitting event', {
                threadUid,
                channel: normalized_event?.channel,
                type: normalized_event?.type,
                raw_event : event,
            });

            if (normalized_event) {

                // ── Forward other events as-is ──
                normalized_event.raw_graph_event = event;
                await emitProtocolThreadEvent(threadUid, normalized_event);

            } else {
                console.dir('[AIStreamBridge] unrecognized event', {
                    threadUid,
                    raw_event: event,
                });

                await emitProtocolThreadEvent(threadUid, {
                    channel: 'debug',
                    type: 'raw-event',
                    seq: null,
                    node: null,
                    data: {
                        reason: 'unrecognized by extractAgentStreamEvent',
                    },
                    raw_graph_event: event,
                } as any);
            }
        }
    };
}

