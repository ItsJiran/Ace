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
        const definition = this.getParserBlock(tag);
        if (!definition) return false;

        let interruptReason: string | undefined;

        const context: ParserBlockHandlerContext = {
            tag,
            body,
            isComplete,
            result,
            session_id: sessionId,
            emit_result: (payload: ParserEmitPayload) => {
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
                        reason: stopReason,
                        interrupt_mode: interruptMode,
                        at: Date.now(),
                    },
                });
            },
        };

        definition.handler(context);

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
}

export const ParserEngine = new ParserEngineSingleton();
