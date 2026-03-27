import { RegistryEngine } from './registryEngine';
import { EventBus } from './eventEngine';
import type {
    AIParseResult,
    ParserBlockHandlerContext,
    ParserBlockRuntime,
    ParserEmitPayload,
    ParserSessionEmitRecord,
    ParserSessionStopSignal,
} from '#/schemas/parser';

type ParserTokenTraceRecord = {
    sessionId?: string;
    at: number;
    sequenceNumber: number;
    inputBytes: number;
    inputPreview: string;
    carryoverInputBytes: number;
    carryoverPreview: string;
    outputBlocks: number;
    outputEvents: number;
    outputTextBytes: number;
    outputTextPreview: string;
    outputCarryoverBytes: number;
    outputCarryoverPreview: string;
    interruptRequested: boolean;
    interruptReason?: string;
};

interface DispatchBlockInput {
    tag: string;
    body: string;
    isComplete: boolean;
    result: AIParseResult;
    sessionId?: string;
    processUid?: string;
}

class ParserEngineSingleton {
    private isRouteBound = false;
    private sessionEmitQueue = new Map<string, ParserSessionEmitRecord[]>();
    private sessionStopQueue = new Map<string, ParserSessionStopSignal[]>();
    private sessionBlockSequence = new Map<string, number>();
    private sessionTokenTraces = new Map<string, ParserTokenTraceRecord[]>();

    private nextBlockId(sessionId?: string): number | undefined {
        if (!sessionId) return undefined;
        const next = (this.sessionBlockSequence.get(sessionId) ?? 0) + 1;
        this.sessionBlockSequence.set(sessionId, next);
        return next;
    }

    private emitSessionResult(input: {
        sessionId?: string;
        processUid?: string;
        tag: string;
        payload: Record<string, unknown>;
    }) {
        const { sessionId, processUid, tag, payload } = input;
        if (!sessionId) return;

        EventBus.emit({
            event_type: 'interaction',
            action: 'parser_result',
            sub_action: 'session',
            process_uid: processUid,
            payload: {
                session_id: sessionId,
                tag,
                at: Date.now(),
                ...payload,
            },
        });
    }

    getParserBlock(tagName: string): ParserBlockRuntime | null {
        return RegistryEngine.getParserBlock(tagName);
    }

    listParserBlocks(): ParserBlockRuntime[] {
        return RegistryEngine.listParserBlocks();
    }

    buildParserBlockProtocolLines(): string {
        return RegistryEngine.buildParserBlockProtocolLines();
    }

    dispatchParsedBlock(input: DispatchBlockInput): boolean {
        const { tag, body, isComplete, result, sessionId, processUid } = input;
        const blockId = this.nextBlockId(sessionId);

        this.emitSessionResult({
            sessionId,
            processUid,
            tag,
            payload: {
                event_name: 'parser_block_detected',
                block_id: blockId,
                block_tag: tag,
                is_complete: isComplete,
                body_bytes: body.length,
                body_preview: body.slice(0, 300),
            },
        });

        const definition = this.getParserBlock(tag);
        if (!definition) {
            this.emitSessionResult({
                sessionId,
                processUid,
                tag,
                payload: {
                    event_name: 'parser_block_registry_missing',
                    block_id: blockId,
                    block_tag: tag,
                    status: 'unhandled',
                },
            });
            return false;
        }

        this.emitSessionResult({
            sessionId,
            processUid,
            tag,
            payload: {
                event_name: 'parser_block_registry_found',
                block_id: blockId,
                block_tag: tag,
                status: 'registered',
                parser_ref: `${definition.package_name}:parsers:${definition.slug}`,
                schema_name: definition.schema.name,
                schema_required_fields: definition.schema.requiredFields,
                schema_optional_fields: definition.schema.optionalFields,
            },
        });

        let interruptReason: string | undefined;

        const context: ParserBlockHandlerContext = {
            tag,
            body,
            isComplete,
            result,
            session_id: sessionId,
            block_id: blockId,
            emit_result: (payload: ParserEmitPayload) => {
                this.emitSessionResult({
                    sessionId,
                    processUid,
                    tag,
                    payload: {
                        block_id: blockId,
                        block_tag: tag,
                        ...payload,
                    },
                });
            },
            request_interrupt: (reason?: string) => {
                result.interrupt_requested = true;
                if (reason && reason.trim().length > 0) {
                    interruptReason = reason;
                    result.interrupt_reason = reason;
                }

                if (!sessionId) return;

                const stopReason = reason && reason.trim().length > 0
                    ? reason.trim()
                    : `${tag}_interrupt_requested`;

                const interruptMode = definition.runtime_behavior?.interrupt_mode ?? 'pause_stream';

                EventBus.emit({
                    event_type: 'interaction',
                    action: 'parser_control',
                    sub_action: 'session_stop',
                    process_uid: processUid,
                    payload: {
                        session_id: sessionId,
                        tag,
                        block_id: blockId,
                        reason: stopReason,
                        interrupt_mode: interruptMode,
                        at: Date.now(),
                    },
                });
            },
        };

        this.emitSessionResult({
            sessionId,
            processUid,
            tag,
            payload: {
                event_name: 'parser_block_handler_started',
                block_id: blockId,
                block_tag: tag,
                status: 'running',
            },
        });

        try {
            definition.handler(context);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.emitSessionResult({
                sessionId,
                processUid,
                tag,
                payload: {
                    event_name: 'parser_block_handler_failed',
                    block_id: blockId,
                    block_tag: tag,
                    status: 'failed',
                    error_message: errorMessage,
                },
            });
            throw error;
        }

        if (
            isComplete &&
            definition.runtime_behavior?.interrupt_on_complete &&
            definition.runtime_behavior?.interrupt_mode &&
            definition.runtime_behavior.interrupt_mode !== 'none'
        ) {
            result.interrupt_requested = true;
            if (!result.interrupt_reason) {
                result.interrupt_reason = `${tag}_interrupt_on_complete`;
            }
        }

        if (result.interrupt_requested && !result.interrupt_reason && interruptReason) {
            result.interrupt_reason = interruptReason;
        }

        this.emitSessionResult({
            sessionId,
            processUid,
            tag,
            payload: {
                event_name: 'parser_block_handler_completed',
                block_id: blockId,
                block_tag: tag,
                status: result.interrupt_requested ? 'interrupted' : 'completed',
                interrupt_requested: Boolean(result.interrupt_requested),
                interrupt_reason: result.interrupt_reason,
            },
        });

        return true;
    }

    registerEventRoutes() {
        if (this.isRouteBound) return;

        EventBus.registerProcessRoute('parser_result:session', ({ payload }) => {
            const sessionId = typeof payload?.session_id === 'string' ? payload.session_id : '';
            if (!sessionId) return;

            const queue = this.sessionEmitQueue.get(sessionId) ?? [];
            queue.push({
                session_id: sessionId,
                tag: typeof payload.tag === 'string' ? payload.tag : 'unknown',
                at: typeof payload.at === 'number' ? payload.at : Date.now(),
                event_name: typeof payload.event_name === 'string' ? payload.event_name : undefined,
                interrupt_hint: typeof payload.interrupt_hint === 'boolean' ? payload.interrupt_hint : undefined,
                payload: payload,
            });
            this.sessionEmitQueue.set(sessionId, queue);
        });

        EventBus.registerProcessRoute('parser_control:session_stop', ({ payload }) => {
            const sessionId = typeof payload?.session_id === 'string' ? payload.session_id : '';
            if (!sessionId) return;

            const queue = this.sessionStopQueue.get(sessionId) ?? [];
            queue.push({
                session_id: sessionId,
                tag: typeof payload.tag === 'string' ? payload.tag : 'unknown',
                at: typeof payload.at === 'number' ? payload.at : Date.now(),
                reason: typeof payload.reason === 'string' && payload.reason.trim().length > 0
                    ? payload.reason
                    : 'parser_session_stop_requested',
                interrupt_mode:
                    payload.interrupt_mode === 'hard_stop' || payload.interrupt_mode === 'pause_stream'
                        ? payload.interrupt_mode
                        : 'pause_stream',
            });
            this.sessionStopQueue.set(sessionId, queue);
        });

        EventBus.registerProcessRoute('ai_gateway:close_session', ({ payload }) => {
            const sessionId = typeof payload?.session_id === 'string' ? payload.session_id : '';
            if (!sessionId) return;
            this.sessionBlockSequence.delete(sessionId);
            this.sessionEmitQueue.delete(sessionId);
            this.sessionStopQueue.delete(sessionId);
            this.sessionTokenTraces.delete(sessionId);
        });

        this.isRouteBound = true;
    }

    drainSessionResults(sessionId: string): ParserSessionEmitRecord[] {
        const queue = this.sessionEmitQueue.get(sessionId) ?? [];
        this.sessionEmitQueue.delete(sessionId);
        return queue;
    }

    drainSessionStopSignals(sessionId: string): ParserSessionStopSignal[] {
        const queue = this.sessionStopQueue.get(sessionId) ?? [];
        this.sessionStopQueue.delete(sessionId);
        return queue;
    }

    recordTokenTrace(trace: ParserTokenTraceRecord): void {
        if (!trace.sessionId) return;
        const queue = this.sessionTokenTraces.get(trace.sessionId) ?? [];
        queue.push(trace);
        this.sessionTokenTraces.set(trace.sessionId, queue);
    }

    drainTokenTraces(sessionId: string): ParserTokenTraceRecord[] {
        const queue = this.sessionTokenTraces.get(sessionId) ?? [];
        this.sessionTokenTraces.delete(sessionId);
        return queue;
    }
}

export const ParserEngine = new ParserEngineSingleton();
