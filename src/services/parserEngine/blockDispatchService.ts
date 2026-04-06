import { EventBus } from '#/services/eventEngine';
import { PARSER_RUNTIME_EVENT } from '#/schemas/parserEventNames';
import { TurnRendererEngine } from '#/services/turnRendererEngine';
import type {
    ParserBlockHandlerContext,
    ParserBlockRuntime,
    PushRendererInput,
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
        const { tag, body, payload_json, payload_parse_error, isComplete, result, sessionId, processUid, turnId } = input;
        const blockId = this.deps.nextBlockId(sessionId);
        let normalizedPayload = payload_json;

        this.deps.emitSessionResult({
            sessionId,
            processUid,
            parsedTag: tag,
            payload: {
                event_name: PARSER_RUNTIME_EVENT.BLOCK_DETECTED,
                block_id: blockId,
                parsed_tag: tag,
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
                parsedTag: tag,
                payload: {
                    event_name: PARSER_RUNTIME_EVENT.BLOCK_REGISTRY_MISSING,
                    block_id: blockId,
                    parsed_tag: tag,
                    status: 'unhandled',
                },
            });
            return false;
        }

        this.deps.emitSessionResult({
            sessionId,
            processUid,
            parsedTag: tag,
            payload: {
                event_name: PARSER_RUNTIME_EVENT.BLOCK_REGISTRY_FOUND,
                block_id: blockId,
                parsed_tag: tag,
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
            payload_json: normalizedPayload,
            payload_parse_error,
            isComplete,
            result,
            session_id: sessionId,
            process_uid: processUid,
            block_id: blockId,
            turn_id: turnId,
            emit_result: (payload) => {
                this.deps.emitSessionResult({
                    sessionId,
                    processUid,
                    parsedTag: tag,
                    payload: {
                        block_id: blockId,
                        parsed_tag: tag,
                        ...payload,
                    },
                });
            },
            push_renderer: turnId
                ? (input: PushRendererInput) => {
                    return TurnRendererEngine.pushRenderer(turnId, {
                        renderer_slug: input.renderer_slug,
                        package_ref: input.package_ref,
                        props: input.props,
                        status: input.status,
                    });
                }
                : undefined,
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
                        parsed_tag: tag,
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
            parsedTag: tag,
            payload: {
                event_name: PARSER_RUNTIME_EVENT.BLOCK_HANDLER_STARTED,
                block_id: blockId,
                parsed_tag: tag,
                status: 'running',
            },
        });

        try {
            const validatorResult = definition.validator?.({
                tag,
                body,
                payload_json: normalizedPayload,
                payload_parse_error,
                isComplete,
                session_id: sessionId,
                block_id: blockId,
            });
            if (validatorResult !== undefined) {
                normalizedPayload = validatorResult;
                context.payload_json = normalizedPayload;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.deps.emitSessionResult({
                sessionId,
                processUid,
                parsedTag: tag,
                payload: {
                    event_name: PARSER_RUNTIME_EVENT.BLOCK_VALIDATOR_FAILED,
                    block_id: blockId,
                    parsed_tag: tag,
                    status: 'failed',
                    error_message: errorMessage,
                },
            });

            result.blocks.push({
                type: tag,
                payload_raw: body,
                payload_json: normalizedPayload,
                payload_parse_error: errorMessage,
                is_complete: isComplete,
            });

            return true;
        }

        try {
            definition.handler(context);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.deps.emitSessionResult({
                sessionId,
                processUid,
                parsedTag: tag,
                payload: {
                    event_name: PARSER_RUNTIME_EVENT.BLOCK_HANDLER_FAILED,
                    block_id: blockId,
                    parsed_tag: tag,
                    status: 'failed',
                    error_message: errorMessage,
                },
            });

            result.blocks.push({
                type: tag,
                payload_raw: body,
                payload_json: normalizedPayload,
                payload_parse_error: errorMessage,
                is_complete: isComplete,
            });

            return true;
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
            parsedTag: tag,
            payload: {
                event_name: PARSER_RUNTIME_EVENT.BLOCK_HANDLER_COMPLETED,
                block_id: blockId,
                parsed_tag: tag,
                status: result.interrupt_requested ? 'interrupted' : 'completed',
                interrupt_requested: Boolean(result.interrupt_requested),
                interrupt_reason: result.interrupt_reason,
            },
        });

        return true;
    }
}
