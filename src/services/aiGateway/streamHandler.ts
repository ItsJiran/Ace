import { StorageEngine } from '../storageEngine';
import { EventBus } from '../eventEngine';
import { parseAIStreamChunk } from '../aiParser';
import type { AISession, ParsedBatchEvent, ParserBatchRecord } from './types';
import type { Interaction } from '../../schemas/events';

const CLASSIFICATIONS: string[] = ['system:dev', 'system:ai_parser'];

/**
 * Processes one incoming chunk of AI stream data for a session.
 *
 * Flow:
 *   chunk → prepend carryover buffer → parseAIStreamChunk
 *     → PATHWAY A: append text + batch record to RAM
 *     → PATHWAY B: emit complete EventBus interactions; buffer incomplete events
 */
export function handleSessionStreamChunk(
    session: AISession,
    chunk: string,
    ramKey: string,
    processUid?: string,
): void {
    // Prepend any carryover from a partial event block in the previous chunk
    const fullStream = session.activeEventBuffer + chunk;
    session.activeEventBuffer = '';

    const { blocks, events, textToPrint } = parseAIStreamChunk(fullStream);

    const memoryState = (StorageEngine.readMemory(ramKey) || {}) as {
        text?: string;
        raw_response?: string;
        parser_batches?: ParserBatchRecord[];
    };
    const currentText = typeof memoryState.text === 'string' ? memoryState.text : '';
    const currentRaw = typeof memoryState.raw_response === 'string' ? memoryState.raw_response : '';
    const currentBatches = Array.isArray(memoryState.parser_batches) ? memoryState.parser_batches : [];

    // Pre-parse all event payloads up-front so we can store parse errors and avoid
    // crashing on malformed JSON mid-stream.
    const parsedEventsForBatch: ParsedBatchEvent[] = events.map((event) => {
        let payloadJson: Record<string, unknown> | null = null;
        let payloadParseError: string | undefined;

        if (event.raw_payload_buffer?.trim()) {
            try {
                payloadJson = JSON.parse(event.raw_payload_buffer) as Record<string, unknown>;
            } catch (error) {
                payloadParseError = error instanceof Error ? error.message : String(error);
            }
        }

        return {
            headers: event.headers,
            raw_payload_buffer: event.raw_payload_buffer,
            is_complete: event.is_complete,
            payload_json: payloadJson,
            payload_parse_error: payloadParseError,
        };
    });

    const nextBatches: ParserBatchRecord[] = [
        ...currentBatches,
        {
            batch_index: currentBatches.length,
            received_at: Date.now(),
            raw_chunk: chunk,
            text_to_print: textToPrint,
            events: parsedEventsForBatch,
            has_carryover_buffer: events.some((e) => !e.is_complete),
        },
    ];

    // ── PATHWAY A: write updated stream state to RAM ──────────────────────────
    StorageEngine.dispatchRAMAction({
        action: 'update_memory',
        memory_uid: ramKey,
        payload: {
            text: currentText + textToPrint,
            raw_response: currentRaw + chunk,
            // Ordered message blocks for this full accumulated response
            blocks,
            parser_batches: nextBatches,
            parser_batch_count: nextBatches.length,
            events_total: nextBatches.reduce((acc, b) => acc + b.events.length, 0),
            last_updated_at: Date.now(),
        },
        classifications: CLASSIFICATIONS,
    });

    // ── PATHWAY B: dispatch complete events onto the EventBus ─────────────────
    events.forEach((event) => {
        if (event.is_complete) {
            session.isInsideEventBlock = false;

            const parsedPayload = parsedEventsForBatch.find(
                (p) =>
                    p.raw_payload_buffer === event.raw_payload_buffer &&
                    p.headers.action === event.headers.action &&
                    p.headers.window_uid === event.headers.window_uid,
            );

            if (parsedPayload?.payload_parse_error) {
                console.warn(
                    `[AIGatewayEngine] [${session.sessionId}] Skip malformed event payload: ${parsedPayload.payload_parse_error}`,
                );
                return;
            }

            const interaction: Interaction = {
                event_type: 'interaction',
                window_uid: event.headers.window_uid,
                process_uid: event.headers.process_uid || processUid,
                widget_uid: event.headers.widget_uid,
                action: event.headers.action,
                sub_action: event.headers.sub_action,
                payload: (parsedPayload?.payload_json || {}) as Record<string, unknown>,
                preallocated_memory: {
                    session_id: session.sessionId,
                    sdk: session.sdk,
                    model: session.model,
                },
            };

            console.log(`[AIGatewayEngine] [${session.sessionId}] Event → ${interaction.action}`);
            EventBus.emit(interaction);
        } else {
            // Incomplete event: stash partial block so the next chunk can continue it
            session.isInsideEventBlock = true;
            const h = event.headers;
            const headerLine = `${h.event_type}, ${h.window_uid}, ${h.process_uid || 'null'}, ${h.widget_uid || 'null'}, ${h.action}, ${h.sub_action}`;
            session.activeEventBuffer = `\n\`\`\`event\n${headerLine}\n${event.raw_payload_buffer}`;
        }
    });
}
