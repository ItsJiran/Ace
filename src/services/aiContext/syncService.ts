import { KernelEngine } from '../kernelEngine';
import type { SessionContextState } from './types';

export function sessionMemoryUid(sessionId: string): string {
    return `system:session:${sessionId}:context`;
}

export function syncSessionMemory(state: SessionContextState): void {
    KernelEngine.writeMemory(sessionMemoryUid(state.session_id), {
        session_id: state.session_id,
        attached_at: state.attached_at,
        updated_at: state.updated_at,
        summary: state.summary,
        turns: [...state.turns],
        history_summaries: [...state.history_summaries],
        used_contexts: [...state.used_contexts],
        context_blocks: [...state.context_blocks],
    });
}

export function syncContextIndex(indexMemoryUid: string, sessions: SessionContextState[]): void {
    KernelEngine.writeMemory(
        indexMemoryUid,
        sessions
            .slice()
            .sort((a, b) => a.session_id.localeCompare(b.session_id))
            .map((s) => ({
                session_id: s.session_id,
                updated_at: s.updated_at,
                used_contexts_count: s.used_contexts.length,
            })),
    );
}