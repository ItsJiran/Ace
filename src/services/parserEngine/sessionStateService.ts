import type {
    ParserSessionEmitRecord,
    ParserSessionStopSignal,
} from '#/schemas/parser';
import type { ParserTokenTraceRecord } from './types';

export class ParserSessionStateService {
    private sessionEmitQueue = new Map<string, ParserSessionEmitRecord[]>();
    private sessionStopQueue = new Map<string, ParserSessionStopSignal[]>();
    private sessionBlockSequence = new Map<string, number>();
    private sessionTokenTraces = new Map<string, ParserTokenTraceRecord[]>();

    nextBlockId(sessionId?: string): number | undefined {
        if (!sessionId) return undefined;
        const next = (this.sessionBlockSequence.get(sessionId) ?? 0) + 1;
        this.sessionBlockSequence.set(sessionId, next);
        return next;
    }

    queueSessionResult(record: ParserSessionEmitRecord): void {
        const queue = this.sessionEmitQueue.get(record.session_id) ?? [];
        queue.push(record);
        this.sessionEmitQueue.set(record.session_id, queue);
    }

    drainSessionResults(sessionId: string): ParserSessionEmitRecord[] {
        const queue = this.sessionEmitQueue.get(sessionId) ?? [];
        this.sessionEmitQueue.delete(sessionId);
        return queue;
    }

    queueSessionStopSignal(signal: ParserSessionStopSignal): void {
        const queue = this.sessionStopQueue.get(signal.session_id) ?? [];
        queue.push(signal);
        this.sessionStopQueue.set(signal.session_id, queue);
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

    cleanupSession(sessionId: string): void {
        this.sessionBlockSequence.delete(sessionId);
        this.sessionEmitQueue.delete(sessionId);
        this.sessionStopQueue.delete(sessionId);
        this.sessionTokenTraces.delete(sessionId);
    }
}
