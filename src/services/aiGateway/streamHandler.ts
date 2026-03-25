import { StorageEngine } from '../storageEngine';
import { EventBus } from '../eventEngine';
import { AIContextEngine } from '../aiContextEngine';
import { AIContextRagEngine } from '../aiContextRagEngine';
import { parseAIStreamChunk } from '#/services/aiParser';
import type { AIMessageBlock } from '#/services/aiParser';
import type { AISession, ParsedBatchEvent, ParserBatchRecord } from './types';
import type { Interaction } from '../../schemas/events';

const CLASSIFICATIONS: string[] = ['system:dev', 'system:ai_parser'];

function pushViolationOnce(violations: string[], message: string): void {
    if (!violations.includes(message)) {
        violations.push(message);
    }
}

function readHistorySummaryMemoryKey(payload: Record<string, unknown>): string | null {
    const candidate = payload.memory_key ?? payload.memory_uid ?? payload.ram_key_id ?? payload.storage_key;
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

function readHistorySummaryRefUid(payload: Record<string, unknown>): string | null {
    const candidate = payload.ref_uid ?? payload.reference_uid;
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : null;
}

function validateHistorySummaryBlock(
    session: AISession,
    block: Extract<AIMessageBlock, { type: 'history_summary_ai_prompt' | 'history_summary_ai_response' }>,
): boolean {
    const protocol = session.currentProtocolState;
    if (!protocol || !block.payload_json) {
        return false;
    }

    const actualKey = readHistorySummaryMemoryKey(block.payload_json);
    const expectedKey = block.type === 'history_summary_ai_prompt'
        ? protocol.prompt_memory_key
        : protocol.response_memory_key;
    const expectedRefUid = block.type === 'history_summary_ai_prompt'
        ? protocol.prompt_ref_uid
        : protocol.response_ref_uid;
    const actualRefUid = readHistorySummaryRefUid(block.payload_json) ?? undefined;

    if (block.type === 'history_summary_ai_prompt' && protocol.prompt_summary_valid) {
        pushViolationOnce(protocol.violations, 'Duplicate history_summary_ai_prompt block ignored after first valid block.');
        return false;
    }

    if (block.type === 'history_summary_ai_response' && protocol.response_summary_valid) {
        pushViolationOnce(protocol.violations, 'Duplicate history_summary_ai_response block ignored after first valid block.');
        return false;
    }

    const isValid = actualKey === expectedKey && (!expectedRefUid || actualRefUid === expectedRefUid);

    if (block.type === 'history_summary_ai_prompt') {
        protocol.prompt_summary_received = true;
        protocol.prompt_summary_valid = isValid;
        if (!isValid) {
            pushViolationOnce(protocol.violations, `Invalid history_summary_ai_prompt block memory binding. expected=${expectedKey}`);
        }
        return isValid;
    }

    protocol.response_summary_received = true;
    protocol.response_summary_valid = isValid;
    if (!isValid) {
        pushViolationOnce(protocol.violations, `Invalid history_summary_ai_response block memory binding. expected=${expectedKey}`);
    }
    return isValid;
}

function mergeBlocks(
    previous: AIMessageBlock[],
    incoming: AIMessageBlock[],
): AIMessageBlock[] {
    const merged = [...previous];

    incoming.forEach((block) => {
        if (block.type === 'paragraph') {
            if (!block.content) return;
            const last = merged[merged.length - 1];
            if (last?.type === 'paragraph') {
                last.content += block.content;
                return;
            }
            merged.push(block);
            return;
        }

        // For execute blocks in looped responses, update the latest block sharing
        // the same memory identity instead of always appending duplicates.
        if (block.type === 'execute_tool' || block.type === 'execute_storage') {
            const identity = block.memory_uid || block.result_memory_uid;
            if (identity) {
                for (let i = merged.length - 1; i >= 0; i -= 1) {
                    const candidate = merged[i];
                    if (
                        (candidate.type === 'execute_tool' || candidate.type === 'execute_storage') &&
                        candidate.type === block.type &&
                        (candidate.memory_uid === identity || candidate.result_memory_uid === identity)
                    ) {
                        merged[i] = {
                            ...candidate,
                            ...block,
                            payload_raw: block.payload_raw || candidate.payload_raw,
                            payload_json: block.payload_json ?? candidate.payload_json,
                            status: block.status === 'unknown' ? candidate.status : block.status,
                        };
                        return;
                    }
                }
            }
        }

        if (
            block.type === 'context' ||
            block.type === 'history_summary_ai_prompt' ||
            block.type === 'history_summary_ai_response' ||
            block.type === 'directive'
        ) {
            const last = merged[merged.length - 1];
            if (
                last &&
                last.type === block.type &&
                'is_complete' in last &&
                !last.is_complete
            ) {
                merged[merged.length - 1] = block;
                return;
            }
        }

        merged.push(block);
    });

    return merged;
}

function buildNextBatches(
    previous: ParserBatchRecord[],
    nextBatch: Omit<ParserBatchRecord, 'batch_index'>,
    shouldMergeWithPrevious: boolean,
): ParserBatchRecord[] {
    if (!shouldMergeWithPrevious || previous.length === 0) {
        return [
            ...previous,
            {
                ...nextBatch,
                batch_index: previous.length,
            },
        ];
    }

    const last = previous[previous.length - 1];
    return [
        ...previous.slice(0, -1),
        {
            batch_index: last.batch_index,
            received_at: nextBatch.received_at,
            raw_chunk: `${last.raw_chunk}${nextBatch.raw_chunk}`,
            text_to_print: `${last.text_to_print}${nextBatch.text_to_print}`,
            events: [...last.events, ...nextBatch.events],
            has_carryover_buffer: nextBatch.has_carryover_buffer,
        },
    ];
}

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
    // Prepend any carryover from an unclosed fenced block in the previous chunk
    const hadCarryoverBuffer = session.activeEventBuffer.length > 0;
    const fullStream = session.activeEventBuffer + chunk;
    session.activeEventBuffer = '';

    const { blocks, events, textToPrint, carryoverBuffer } = parseAIStreamChunk(fullStream);

    // Save carryover immediately so non-event fenced blocks (e.g. context)
    // that are split across chunks can be recovered on the next chunk.
    session.activeEventBuffer = carryoverBuffer;

    // Direct parser -> context bridge:
    // any complete `context` block from aiParser is immediately ingested.
    blocks.forEach((block) => {
        if (block.type !== 'context' || !block.is_complete) return;
        if (!block.payload_json) return;
        AIContextEngine.ingestContextBlock(session.sessionId, block.payload_json);
    });

    blocks.forEach((block) => {
        if (
            (block.type !== 'history_summary_ai_prompt' && block.type !== 'history_summary_ai_response') ||
            !block.is_complete ||
            !block.payload_json
        ) {
            return;
        }

        if (!validateHistorySummaryBlock(session, block)) {
            return;
        }

        AIContextEngine.ingestHistorySummaryBlock(session.sessionId, block.type, block.payload_json);
    });

    const memoryState = (StorageEngine.readMemory(ramKey) || {}) as {
        text?: string;
        raw_response?: string;
        blocks?: AIMessageBlock[];
        parser_batches?: ParserBatchRecord[];
        response_reference?: { ref_uid: string; storage_key: string };
        protocol_validation?: unknown;
    };
    const currentText = typeof memoryState.text === 'string' ? memoryState.text : '';
    const currentRaw = typeof memoryState.raw_response === 'string' ? memoryState.raw_response : '';
    const currentBlocks = Array.isArray(memoryState.blocks) ? memoryState.blocks : [];
    const currentBatches = Array.isArray(memoryState.parser_batches) ? memoryState.parser_batches : [];
    const nextBlocks = mergeBlocks(currentBlocks, blocks);

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

    const nextBatches = buildNextBatches(
        currentBatches,
        {
            received_at: Date.now(),
            raw_chunk: chunk,
            text_to_print: textToPrint,
            events: parsedEventsForBatch,
            has_carryover_buffer: carryoverBuffer.length > 0,
        },
        hadCarryoverBuffer,
    );

    // ── PATHWAY A: write updated stream state to RAM ──────────────────────────
    StorageEngine.dispatchRAMAction({
        action: 'update_memory',
        memory_uid: ramKey,
        payload: {
            text: currentText + textToPrint,
            raw_response: currentRaw + chunk,
            // Ordered message blocks for full accumulated response
            blocks: nextBlocks,
            parser_batches: nextBatches,
            parser_batch_count: nextBatches.length,
            events_total: nextBatches.reduce((acc, b) => acc + b.events.length, 0),
            last_updated_at: Date.now(),
            protocol_validation: session.currentProtocolState ?? memoryState.protocol_validation ?? null,
        },
        classifications: CLASSIFICATIONS,
    });

    if (memoryState.response_reference?.storage_key) {
        AIContextRagEngine.writeReferencePayload(memoryState.response_reference.storage_key, {
            session_id: session.sessionId,
            sdk: session.sdk,
            model: session.model,
            raw_response: currentRaw + chunk,
            text: currentText + textToPrint,
            status: 'streaming',
            updated_at: Date.now(),
        });
    }

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
            // Incomplete event: parser already stashed unclosed fence into
            // `carryoverBuffer`, we only need to track session state flags.
            session.isInsideEventBlock = true;
        }
    });
}
