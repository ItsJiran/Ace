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
            });

            if (normalized_event) {

                // ── Intercept content-block-delta → XML structured output ──
                if (normalized_event.channel === 'messages' &&
                    normalized_event.type === 'content-block-delta') {

                    const runId = (normalized_event as any).data?.run_id as string;
                    if (!runId) {
                        normalized_event.raw_graph_event = event;
                        await emitProtocolThreadEvent(threadUid, normalized_event);
                        continue;
                    }

                    // Get or create parser for this run
                    let entry = structuredParsers.get(runId);
                    if (!entry) {
                        entry = {
                            parser: new XmlStreamParser(),
                            seq: 0,
                            node: normalized_event.node as string ?? 'unknown',
                        };
                        structuredParsers.set(runId, entry);
                    }

                    const text = (normalized_event as any).data?.delta?.text ?? '';
                    if (text) {
                        const parserEvents = entry.parser.feed(text);

                        for (const pev of parserEvents) {
                            entry.seq++;
                            if (pev.type === 'ace_tag_start') {
                                await emitProtocolThreadEvent(threadUid, {
                                    channel: 'structured',
                                    type: 'ace_tag_start',
                                    seq: entry.seq,
                                    node: entry.node as any,
                                    data: { tag: pev.tag, node: entry.node, seq: entry.seq },
                                } as any);
                            } else if (pev.type === 'ace_tag_delta') {
                                await emitProtocolThreadEvent(threadUid, {
                                    channel: 'structured',
                                    type: 'ace_tag_delta',
                                    seq: entry.seq,
                                    node: entry.node as any,
                                    data: { tag: pev.tag, text: pev.text, seq: entry.seq },
                                } as any);
                            } else if (pev.type === 'ace_tag_end') {
                                await emitProtocolThreadEvent(threadUid, {
                                    channel: 'structured',
                                    type: 'ace_tag_end',
                                    seq: entry.seq,
                                    node: entry.node as any,
                                    data: { tag: pev.tag, seq: entry.seq },
                                } as any);
                            }
                        }
                    }
                    // Suppress raw delta — structured events replace it
                    continue;
                }

                // ── Clean up on message-finish ──
                if (normalized_event.channel === 'messages' &&
                    normalized_event.type === 'message-finish') {

                    // Forward the message-finish event itself
                    normalized_event.raw_graph_event = event;
                    await emitProtocolThreadEvent(threadUid, normalized_event);

                    // Flush remaining parser state
                    const runId = (normalized_event as any).data?.run_id as string;
                    const entry = structuredParsers.get(runId);
                    if (entry) {
                        const flushEvents = entry.parser.flushRemaining();
                        for (const pev of flushEvents) {
                            if (pev.type === 'ace_tag_delta' && pev.text) {
                                entry.seq++;
                                await emitProtocolThreadEvent(threadUid, {
                                    channel: 'structured',
                                    type: 'ace_tag_delta',
                                    seq: entry.seq,
                                    node: entry.node as any,
                                    data: { tag: pev.tag, text: pev.text, seq: entry.seq },
                                } as any);
                            }
                        }
                        entry.parser.close();
                        structuredParsers.delete(runId);
                    }

                    // Emit stream complete
                    await emitProtocolThreadEvent(threadUid, {
                        channel: 'structured',
                        type: 'ace_model_stream_complete',
                        seq: null,
                        node: normalized_event.node as any,
                        data: { node: normalized_event.node as string ?? 'unknown' },
                    } as any);

                    continue;
                }

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

