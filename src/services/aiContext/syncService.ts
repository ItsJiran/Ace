import { StorageEngine } from '../storageEngine';
import type { SessionContextState } from './types';

export function sessionMemoryUid(sessionId: string): string {
    return `system:session:${sessionId}:context`;
}

export function syncSessionMemory(state: SessionContextState): void {
    StorageEngine.dispatchRAMAction({
        action: 'create_memory',
        memory_uid: sessionMemoryUid(state.session_id),
        payload: {
            session_id: state.session_id,
            attached_at: state.attached_at,
            updated_at: state.updated_at,
            summary: state.summary,
            turns: [...state.turns],
            history_summaries: [...state.history_summaries],
            used_contexts: [...state.used_contexts],
            context_blocks: [...state.context_blocks],
        },
        classifications: ['system:core', 'system:ai_context_engine', 'system:session_context'],
    });
}

export function syncContextIndex(indexMemoryUid: string, sessions: SessionContextState[]): void {
    StorageEngine.dispatchRAMAction({
        action: 'create_memory',
        memory_uid: indexMemoryUid,
        payload: sessions
            .slice()
            .sort((a, b) => a.session_id.localeCompare(b.session_id))
            .map((s) => ({
                session_id: s.session_id,
                updated_at: s.updated_at,
                used_contexts_count: s.used_contexts.length,
            })),
        classifications: ['system:core', 'system:ai_context_engine'],
    });
}