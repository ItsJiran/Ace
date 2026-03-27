import { EventBus } from '#/services/eventEngine';
import type {
    ParserBlockHandlerContext,
    ParserBlockRuntime,
} from '#/schemas/parser';
import type { DispatchBlockInput, EmitSessionResultInput } from './types';

interface ParserBlockDispatchServiceDeps {
    getParserBlock: (tagName: string) => ParserBlockRuntime | null;
    emitSessionResult: (input: EmitSessionResultInput) => void;
    nextBlockId: (sessionId?: string) => number | undefined;
}

export class ParserBlockDispatchService {
    private readonly deps: ParserBlockDispatchServiceDeps;

    constructor(deps: ParserBlockDispatchServiceDeps) {
        this.deps = deps;
    }

    dispatchParsedBlock(input: DispatchBlockInput): boolean {
        const { tag, body, isComplete, result, sessionId, processUid } = input;
        const blockId = this.deps.nextBlockId(sessionId);

        this.deps.emitSessionResult({
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

        const definition = this.deps.getParserBlock(tag);
        if (!definition) {
            this.deps.emitSessionResult({
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

        this.deps.emitSessionResult({
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
            emit_result: (payload) => {
                this.deps.emitSessionResult({
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

                const stopReason =
                    reason && reason.trim().length > 0 ? reason.trim() : `${tag}_interrupt_requested`;

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

        this.deps.emitSessionResult({
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
            this.deps.emitSessionResult({
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

        this.deps.emitSessionResult({
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
}
