import { EventBus } from '#/services/eventEngine';
import type {
    ParserSessionEmitRecord,
    ParserSessionStopSignal,
} from '#/schemas/parser';

interface ParserEventRouteServiceDeps {
    onSessionResult: (record: ParserSessionEmitRecord) => void;
    onSessionStopSignal: (signal: ParserSessionStopSignal) => void;
    onSessionClose: (sessionId: string) => void;
}

export class ParserEventRouteService {
    private isRouteBound = false;
    private readonly deps: ParserEventRouteServiceDeps;

    constructor(deps: ParserEventRouteServiceDeps) {
        this.deps = deps;
    }

    registerEventRoutes(): void {
        if (this.isRouteBound) return;

        EventBus.registerProcessRoute('parser_result:session', ({ payload }) => {
            const sessionId = typeof payload?.session_id === 'string' ? payload.session_id : '';
            if (!sessionId) return;

            this.deps.onSessionResult({
                session_id: sessionId,
                tag: typeof payload.tag === 'string' ? payload.tag : 'unknown',
                at: typeof payload.at === 'number' ? payload.at : Date.now(),
                event_name: typeof payload.event_name === 'string' ? payload.event_name : undefined,
                interrupt_hint: typeof payload.interrupt_hint === 'boolean' ? payload.interrupt_hint : undefined,
                payload,
            });
        });

        EventBus.registerProcessRoute('parser_control:session_stop', ({ payload }) => {
            const sessionId = typeof payload?.session_id === 'string' ? payload.session_id : '';
            if (!sessionId) return;

            this.deps.onSessionStopSignal({
                session_id: sessionId,
                tag: typeof payload.tag === 'string' ? payload.tag : 'unknown',
                at: typeof payload.at === 'number' ? payload.at : Date.now(),
                reason:
                    typeof payload.reason === 'string' && payload.reason.trim().length > 0
                        ? payload.reason
                        : 'parser_session_stop_requested',
                interrupt_mode:
                    payload.interrupt_mode === 'hard_stop' || payload.interrupt_mode === 'pause_stream'
                        ? payload.interrupt_mode
                        : 'pause_stream',
            });
        });

        EventBus.registerProcessRoute('ai_gateway:close_session', ({ payload }) => {
            const sessionId = typeof payload?.session_id === 'string' ? payload.session_id : '';
            if (!sessionId) return;
            this.deps.onSessionClose(sessionId);
        });

        this.isRouteBound = true;
    }
}
