/**
 * Prompt Builder Selectors
 *
 * Summary:
 * - provides read-only selectors over session context, history, working memory, and plans
 * - centralizes sorting and filtering rules used across prompt sections
 * - keeps section builders focused on rendering instead of data selection
 */

import type { AISession, AIPlanEntry } from '#/schemas/ai';

export function getActiveContextEntries(session: AISession) {
    if (!session.context || session.context.length === 0) return [];

    const start = session.context_start_index ?? 0;
    const end = session.context_end_index ?? session.context.length - 1;

    return session.context
        .slice(start, end + 1)
        .filter((entry) => entry.status === 'active');
}

export function getPrioritizedWorkingMemoryEntries(session: AISession) {
    return [...(session.working_memory ?? [])].sort((left, right) => {
        const leftTurn = left.lifecycle_turn ?? -1;
        const rightTurn = right.lifecycle_turn ?? -1;

        if (leftTurn !== rightTurn) return rightTurn - leftTurn;
        return right.created_at - left.created_at;
    });
}

export function getCurrentStatePlanEntries(session: AISession): AIPlanEntry[] {
    return [...(session.plan ?? [])]
        .filter((entry) => entry.state === session.state)
        .filter((entry) => entry.lifecycle_turn === undefined || entry.lifecycle_turn === session.turn_index)
        .sort((left, right) => (left.step_index ?? Number.MAX_SAFE_INTEGER) - (right.step_index ?? Number.MAX_SAFE_INTEGER));
}

export function getLatestCompletedAssistantEntry(session: AISession) {
    for (let turnIndex = Math.min(session.turn_index, session.turns.length - 1); turnIndex >= 0; turnIndex -= 1) {
        const turn = session.turns[turnIndex];
        if (!turn) continue;

        for (let entryIndex = turn.entries.length - 1; entryIndex >= 0; entryIndex -= 1) {
            const entry = turn.entries[entryIndex];
            if (entry?.status === 'completed' || entry?.status === 'success') {
                if (entry.response?.trim()) return entry;
            }
        }
    }

    return undefined;
}