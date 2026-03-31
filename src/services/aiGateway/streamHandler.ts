import { KernelEngine } from '../kernelEngine';
import { ProcessEngine } from '../processEngine';
import { EventBus } from '../eventEngine';
import { AIContextEngine } from '../aiContextEngine';
import { AIContextMemoryEngine } from '../aiContextMemoryEngine';
import { ParserEngine } from '../parserEngine';
import { parseAIStreamChunk } from '#/services/aiParser';
import { AI_GATEWAY_ROUTE_ACTION, AI_GATEWAY_ROUTE_SUB_ACTION } from './types';
import type { AIMessageBlock } from '#/services/aiParser';
import type { AISession, ParsedBatchEvent, ParserBatchRecord } from './types';
import type { Interaction } from '../../schemas/events';
import type { BaseBlock, ParserInterruptMode, ParserSessionEmitRecord, ParserSessionStopSignal } from '#/schemas/parser';

type RuntimeActionBlock = {
    block_slug: 'tool' | 'storage';
    payload_raw: string;
    payload_json: Record<string, unknown> | null;
    payload_parse_error?: string;
    is_complete: boolean;
    status?: string;
    action?: string;
    memory_uid?: string;
    result_memory_uid?: string;
};

type HistorySummaryBlock = BaseBlock & {
    block_slug: 'history_summary_ai_prompt' | 'history_summary_ai_response';
};

function asRuntimeActionBlock(block: AIMessageBlock): RuntimeActionBlock | null {
    if (block.block_slug !== 'tool' && block.block_slug !== 'storage') return null;
    return block as unknown as RuntimeActionBlock;
}

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
    block: HistorySummaryBlock,
): boolean {
    const protocol = session.currentProtocolState;
    if (!protocol || !block.payload_json) {
        return false;
    }

    const actualKey = readHistorySummaryMemoryKey(block.payload_json);
    const expectedKey = block.block_slug === 'history_summary_ai_prompt'
        ? protocol.prompt_memory_key
        : protocol.response_memory_key;
    const expectedRefUid = block.block_slug === 'history_summary_ai_prompt'
        ? protocol.prompt_ref_uid
        : protocol.response_ref_uid;
    const actualRefUid = readHistorySummaryRefUid(block.payload_json) ?? undefined;
    const isRequired = block.block_slug === 'history_summary_ai_prompt'
        ? protocol.require_prompt_summary
        : protocol.require_response_summary;

    if (block.block_slug === 'history_summary_ai_prompt' && protocol.prompt_summary_valid) {
        if (isRequired) {
            pushViolationOnce(protocol.violations, 'Duplicate history_summary_ai_prompt block ignored after first valid block.');
        }
        return false;
    }

    if (block.block_slug === 'history_summary_ai_response' && protocol.response_summary_valid) {
        if (isRequired) {
            pushViolationOnce(protocol.violations, 'Duplicate history_summary_ai_response block ignored after first valid block.');
        }
        return false;
    }

    const isValid = actualKey === expectedKey && (!expectedRefUid || actualRefUid === expectedRefUid);

    if (block.block_slug === 'history_summary_ai_prompt') {
        protocol.prompt_summary_received = true;
        protocol.prompt_summary_valid = isValid;
        if (isRequired && !isValid) {
            pushViolationOnce(protocol.violations, `Invalid history_summary_ai_prompt block memory binding. expected=${expectedKey}`);
        }
        return isValid;
    }

    protocol.response_summary_received = true;
    protocol.response_summary_valid = isValid;
    if (isRequired && !isValid) {
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
        if (block.block_slug === 'paragraph') {
            if (!block.content) return;
            const last = merged[merged.length - 1];
            if (last?.block_slug === 'paragraph' && typeof last.content === 'string' && typeof block.content === 'string') {
                last.content += block.content;
                return;
            }
            merged.push(block);
            return;
        }

        // For execute blocks in looped responses, update the latest block sharing
        // the same memory identity instead of always appending duplicates.
        if (block.block_slug === 'tool' || block.block_slug === 'storage') {
            const actionBlock = asRuntimeActionBlock(block);
            if (!actionBlock) return;
            const identity = actionBlock.memory_uid || actionBlock.result_memory_uid;
            if (identity) {
                for (let i = merged.length - 1; i >= 0; i -= 1) {
                    const candidate = merged[i];
                    const candidateActionBlock = asRuntimeActionBlock(candidate);
                    if (
                        candidateActionBlock &&
                        candidate.block_slug === block.block_slug &&
                        (candidateActionBlock.memory_uid === identity || candidateActionBlock.result_memory_uid === identity)
                    ) {
                        merged[i] = {
                            ...candidate,
                            ...block,
                            payload_raw: block.payload_raw || candidate.payload_raw,
                            payload_json: block.payload_json ?? candidate.payload_json,
                            status: actionBlock.status === 'unknown' ? candidateActionBlock.status : actionBlock.status,
                        };
                        return;
                    }
                }
            }
        }

        if (
            block.block_slug === 'context' ||
            block.block_slug === 'history_summary_ai_prompt' ||
            block.block_slug === 'history_summary_ai_response' ||
            block.block_slug === 'directive'
        ) {
            const last = merged[merged.length - 1];
            if (
                last &&
                last.block_slug === block.block_slug &&
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

function buildToolInteractionFromBlock(input: {
    block: RuntimeActionBlock & { block_slug: 'tool' };
    session: AISession;
    processUid?: string;
    fallbackResultKey: string;
}): Interaction | null {
    const { block, session, processUid, fallbackResultKey } = input;
    const blockRecord = block as unknown as Record<string, unknown>;
    const action = typeof block.action === 'string' ? block.action : '';
    if (!action) return null;

    const payloadJson = block.payload_json && typeof block.payload_json === 'object'
        ? block.payload_json
        : {};

    const packageRef =
        typeof (payloadJson as Record<string, unknown>).package_ref === 'string'
            ? (payloadJson as Record<string, unknown>).package_ref as string
            : typeof blockRecord.package_ref === 'string'
                ? blockRecord.package_ref as string
                : undefined;

    const toolSlug =
        typeof (payloadJson as Record<string, unknown>).tool_slug === 'string'
            ? (payloadJson as Record<string, unknown>).tool_slug as string
            : typeof (payloadJson as Record<string, unknown>).tool === 'string'
                ? (payloadJson as Record<string, unknown>).tool as string
                : typeof blockRecord.tool_slug === 'string'
                    ? blockRecord.tool_slug as string
                    : undefined;

    return {
        event_type: 'interaction',
        process_uid: processUid,
        action: AI_GATEWAY_ROUTE_ACTION.TOOL,
        sub_action: action,
        payload: {
            ...payloadJson,
            package_ref: packageRef,
            tool_slug: toolSlug,
            result_memory_uid: block.result_memory_uid ?? fallbackResultKey,
            memory_uid: block.memory_uid,
            status: block.status,
        },
        preallocated_memory: {
            session_id: session.sessionId,
            sdk: session.sdk,
            model: session.model,
            reply_to_ram_key: block.result_memory_uid ?? fallbackResultKey,
        },
    };
}

function emitParserSessionResult(input: {
    sessionId: string;
    processUid?: string;
    eventName: string;
    payload?: Record<string, unknown>;
}) {
    const { sessionId, processUid, eventName, payload } = input;
    EventBus.emit({
        event_type: 'interaction',
        action: AI_GATEWAY_ROUTE_ACTION.PARSER_RESULT,
        sub_action: AI_GATEWAY_ROUTE_SUB_ACTION.SESSION,
        process_uid: processUid,
        payload: {
            session_id: sessionId,
            parsed_tag: 'parser',
            at: Date.now(),
            event_name: eventName,
            ...(payload || {}),
        },
    });
}

function writeParserFailureMemory(input: {
    session: AISession;
    ramKey: string;
    reason: string;
    processUid?: string;
    details?: Record<string, unknown>;
}): string {
    const { session, ramKey, reason, processUid, details } = input;
    const parserErrorMemoryUid = `${ramKey}:parser_error`;

    const payload = {
        session_id: session.sessionId,
        process_uid: processUid,
        error_type: 'parser_failure',
        reason,
        details: details || {},
        at: Date.now(),
    };

    if (processUid) {
        const created = ProcessEngine.createRuntimeMemory({
            owner_process_uid: processUid,
            owner_session_id: session.sessionId,
            memory_uid: parserErrorMemoryUid,
            payload,
            memory_scope: 'process',
            retention_policy: 'keep_on_done',
        });

        if (!created) {
            ProcessEngine.updateRuntimeMemory({
                owner_process_uid: processUid,
                memory_uid: parserErrorMemoryUid,
                payload,
            });
        }
    } else {
        KernelEngine.writeMemory(parserErrorMemoryUid, payload);
    }

    return parserErrorMemoryUid;
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
    turnId?: string,
): { interrupted: boolean; reason?: string; mode?: ParserInterruptMode } {
    // Prepend any carryover from an unclosed fenced block in the previous chunk
    const incomingCarryover = session.activeEventBuffer;
    const hadCarryoverBuffer = session.activeEventBuffer.length > 0;
    const fullStream = session.activeEventBuffer + chunk;
    session.activeEventBuffer = '';

    emitParserSessionResult({
        sessionId: session.sessionId,
        processUid,
        eventName: 'parser_parsing_started',
        payload: {
            chunk_bytes: chunk.length,
            carryover_bytes: incomingCarryover.length,
            chunk_preview: chunk.length > 0 ? chunk.slice(0, 600) : '(empty)',
            carryover_preview: incomingCarryover.length > 0 ? incomingCarryover.slice(0, 600) : '(none)',
            ram_key: ramKey,
        },
    });

    let parsed;
    try {
        parsed = parseAIStreamChunk(fullStream, {
            sessionId: session.sessionId,
            processUid,
            rawChunk: chunk,
            incomingCarryover,
            turnId,
        });
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const parserErrorMemoryUid = writeParserFailureMemory({
            session,
            ramKey,
            reason: `parseAIStreamChunk_exception:${reason}`,
            processUid,
            details: {
                chunk_preview: chunk.slice(0, 600),
                full_stream_preview: fullStream.slice(0, 1200),
            },
        });

        KernelEngine.updateMemory(ramKey, {
            parser_runtime_status: 'failed',
            parser_last_error: reason,
            parser_error_memory_uid: parserErrorMemoryUid,
            last_updated_at: Date.now(),
        });

        emitParserSessionResult({
            sessionId: session.sessionId,
            processUid,
            eventName: 'parser_parse_failed',
            payload: {
                reason,
                parser_error_memory_uid: parserErrorMemoryUid,
            },
        });

        return {
            interrupted: true,
            reason: `parser_parse_failed:${reason}`,
            mode: 'hard_stop',
        };
    }

    const { blocks, events, textToPrint, carryoverBuffer, interrupt_requested, interrupt_reason } = parsed;

    emitParserSessionResult({
        sessionId: session.sessionId,
        processUid,
        eventName: 'parser_parsing_completed',
        payload: {
            chunk_bytes: chunk.length,
            produced_blocks: blocks.length,
            produced_events: events.length,
            carryover_bytes: carryoverBuffer.length,
            output_text_bytes: textToPrint.length,
            output_text_preview: textToPrint.length > 0 ? textToPrint.slice(0, 600) : '(empty)',
            carryover_preview: carryoverBuffer.length > 0 ? carryoverBuffer.slice(0, 600) : '(none)',
        },
    });

    // Save carryover immediately so non-event fenced blocks (e.g. context)
    // that are split across chunks can be recovered on the next chunk.
    session.activeEventBuffer = carryoverBuffer;

    // Direct parser -> context bridge:
    // any complete `context` block from aiParser is immediately ingested.
    blocks.forEach((block) => {
        if (block.block_slug !== 'context' || !block.is_complete || !block.payload_json) return;
        const payload = block.payload_json as Record<string, unknown>;
        const requestedAction = typeof payload.action === 'string' ? payload.action.trim().toLowerCase() : '';
        const action =
            requestedAction === 'retrieve' || requestedAction === 'store' || requestedAction === 'update'
                ? requestedAction
                : 'update';
        const memoryKey = typeof payload.memory_key === 'string' ? payload.memory_key : undefined;
        const requestedResultUid = typeof payload.result_memory_uid === 'string' ? payload.result_memory_uid : undefined;

        if (action === 'update') {
            AIContextEngine.ingestContextBlock(session.sessionId, block.payload_json);
            return;
        }

        // retrieve / store: dispatch to EventBus route handled by AIContextEngine
        const fallbackResultKey =
            requestedResultUid ??
            `system:session:${session.sessionId}:ctx_result:${Date.now()}`;

        EventBus.emit({
            event_type: 'interaction',
            action: AI_GATEWAY_ROUTE_ACTION.PARSER_RESULT,
            sub_action: AI_GATEWAY_ROUTE_SUB_ACTION.SESSION,
            process_uid: processUid,
            payload: {
                session_id: session.sessionId,
                parsed_tag: 'context',
                at: Date.now(),
                event_name: 'parser_handler_dispatch',
                block_slug: 'context',
                action,
                memory_key: memoryKey,
                result_memory_uid: fallbackResultKey,
            },
        });

        EventBus.emit({
            event_type: 'interaction',
            action: `context:${action}`,
            process_uid: processUid,
            payload: {
                ...(block.payload_json as Record<string, unknown>),
                session_id: session.sessionId,
                memory_key: memoryKey,
                result_memory_uid: fallbackResultKey,
            },
            preallocated_memory: {
                session_id: session.sessionId,
                sdk: session.sdk,
                model: session.model,
                result_memory_uid: fallbackResultKey,
            },
        });
    });

    blocks.forEach((block) => {
        if (
            (block.block_slug !== 'history_summary_ai_prompt' && block.block_slug !== 'history_summary_ai_response') ||
            !block.is_complete ||
            !block.payload_json
        ) {
            return;
        }

        if (!validateHistorySummaryBlock(session, block as HistorySummaryBlock)) {
            return;
        }

        AIContextEngine.ingestHistorySummaryBlock(session.sessionId, block.block_slug, block.payload_json);
    });

    const memoryState = (KernelEngine.readMemory(ramKey) || {}) as {
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
    const parserHandlerResults: ParserSessionEmitRecord[] = ParserEngine.drainSessionResults(session.sessionId);
    const parserStopSignals: ParserSessionStopSignal[] = ParserEngine.drainSessionStopSignals(session.sessionId);
    const parserTokenTraces = ParserEngine.drainTokenTraces(session.sessionId);
    const currentHandlerResults = Array.isArray((memoryState as Record<string, unknown>).parser_handler_results)
        ? ((memoryState as Record<string, unknown>).parser_handler_results as ParserSessionEmitRecord[])
        : [];
    const nextHandlerResults = [...currentHandlerResults, ...parserHandlerResults].slice(-120);
    const currentStopSignals = Array.isArray((memoryState as Record<string, unknown>).parser_stop_signals)
        ? ((memoryState as Record<string, unknown>).parser_stop_signals as ParserSessionStopSignal[])
        : [];
    const nextStopSignals = [...currentStopSignals, ...parserStopSignals].slice(-40);
    const currentTokenTraces = Array.isArray((memoryState as Record<string, unknown>).parser_token_traces)
        ? ((memoryState as Record<string, unknown>).parser_token_traces as Array<Record<string, unknown>>)
        : [];
    const nextTokenTraces = [...currentTokenTraces, ...parserTokenTraces].slice(-300);

    const malformedBlocks = blocks
        .map((block) => asRuntimeActionBlock(block))
        .filter((block): block is RuntimeActionBlock => Boolean(block));

    let parserRuntimeStatus: 'idle' | 'failed' = 'idle';
    let parserLastError: string | undefined;
    let parserErrorMemoryUid: string | undefined;

    if (malformedBlocks.some((block) => typeof block.payload_parse_error === 'string' && block.payload_parse_error.length > 0)) {
        const malformedErrorBlocks = malformedBlocks.filter((block) => typeof block.payload_parse_error === 'string' && block.payload_parse_error.length > 0);

        parserRuntimeStatus = 'failed';
        parserLastError = `${malformedErrorBlocks.length} malformed parser block(s)`;
        parserErrorMemoryUid = writeParserFailureMemory({
            session,
            ramKey,
            reason: parserLastError,
            processUid,
            details: {
                malformed_blocks: malformedErrorBlocks.map((block) => ({
                    block_slug: block.block_slug,
                    action: block.action,
                    status: block.status,
                    payload_parse_error: block.payload_parse_error,
                    payload_raw: block.payload_raw,
                })),
            },
        });

        emitParserSessionResult({
            sessionId: session.sessionId,
            processUid,
            eventName: 'parser_block_parse_error',
            payload: {
                count: malformedErrorBlocks.length,
                parser_error_memory_uid: parserErrorMemoryUid,
            },
        });
    }

    // ── PATHWAY A: write updated stream state to RAM ──────────────────────────
    const streamPayload = {
        text: currentText + textToPrint,
        raw_response: currentRaw + chunk,
        // Ordered message blocks for full accumulated response
        blocks: nextBlocks,
        parser_batches: nextBatches,
        parser_batch_count: nextBatches.length,
        events_total: nextBatches.reduce((acc, b) => acc + b.events.length, 0),
        parser_handler_results: nextHandlerResults,
        parser_handler_result_count: nextHandlerResults.length,
        parser_handler_last_result_at:
            nextHandlerResults.length > 0
                ? nextHandlerResults[nextHandlerResults.length - 1].at
                : undefined,
        parser_stop_signals: nextStopSignals,
        parser_stop_signal_count: nextStopSignals.length,
        parser_last_stop_at:
            nextStopSignals.length > 0
                ? nextStopSignals[nextStopSignals.length - 1].at
                : undefined,
        parser_token_traces: nextTokenTraces,
        parser_token_trace_count: nextTokenTraces.length,
        parser_runtime_status: parserRuntimeStatus,
        parser_last_error: parserLastError,
        parser_error_memory_uid: parserErrorMemoryUid,
        last_updated_at: Date.now(),
        protocol_validation: session.currentProtocolState ?? memoryState.protocol_validation ?? null,
    };

    const updatedByProcess = processUid
        ? ProcessEngine.updateRuntimeMemory({
            owner_process_uid: processUid,
            memory_uid: ramKey,
            payload: streamPayload,
        })
        : false;

    if (!updatedByProcess) {
        KernelEngine.updateMemory(ramKey, streamPayload);
    }

    if (memoryState.response_reference?.storage_key) {
        AIContextMemoryEngine.writeMemoryPayload(memoryState.response_reference.storage_key, {
            session_id: session.sessionId,
            sdk: session.sdk,
            model: session.model,
            raw_response: currentRaw + chunk,
            text: currentText + textToPrint,
            status: 'streaming',
            updated_at: Date.now(),
        }, { status: 'out' });
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

    blocks.forEach((block, index) => {
        if (block.block_slug !== 'tool' || !block.is_complete) return;

        const fallbackResultKey =
            (typeof block.result_memory_uid === 'string' ? block.result_memory_uid : undefined) ??
            `system:session:${session.sessionId}:tool_result:${Date.now()}:${index}`;

        const interaction = buildToolInteractionFromBlock({
            block: block as unknown as RuntimeActionBlock & { block_slug: 'tool' },
            session,
            processUid,
            fallbackResultKey,
        });

        if (!interaction) return;

        EventBus.emit({
            event_type: 'interaction',
            action: AI_GATEWAY_ROUTE_ACTION.PARSER_RESULT,
            sub_action: AI_GATEWAY_ROUTE_SUB_ACTION.SESSION,
            process_uid: processUid,
            payload: {
                session_id: session.sessionId,
                parsed_tag: 'tool',
                at: Date.now(),
                event_name: 'parser_handler_dispatch',
                block_slug: 'tool',
                action: interaction.sub_action,
                result_memory_uid: (interaction.payload as Record<string, unknown>).result_memory_uid,
                payload: interaction.payload,
            },
        });

        EventBus.emit(interaction);
    });

    const latestStop = nextStopSignals.length > 0 ? nextStopSignals[nextStopSignals.length - 1] : undefined;

    return {
        interrupted: Boolean(interrupt_requested) || Boolean(latestStop),
        reason: latestStop?.reason ?? interrupt_reason,
        mode: latestStop?.interrupt_mode,
    };
}
