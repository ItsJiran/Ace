/**
 * Prompt Builder Selectors
 *
 * Summary:
 * - provides read-only selectors over session context, history, working memory, and plans
 * - centralizes sorting and filtering rules used across prompt sections
 * - keeps section builders focused on rendering instead of data selection
 */

import type { AISession, AIPlanEntry } from '#/schemas/ai';

const PLAN_STATE_ORDER: Record<string, number> = {
    Reason: 0,
    Act: 1,
    Observe: 2,
    Finalize: 3,
};

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
    const currentCycleIndex = session.state_cycle_index ?? 0;

    return [...(session.plan ?? [])]
        .filter((entry) => session.state === 'Reason' ? entry.state === 'Act' : entry.state === 'Act' && session.state === 'Act')
        .filter((entry) => entry.lifecycle_turn === undefined || entry.lifecycle_turn === session.turn_index)
        .filter((entry) => (entry.lifecycle_cycle ?? 0) === currentCycleIndex)
        .sort((left, right) => {
            const leftStateRank = PLAN_STATE_ORDER[left.state] ?? Number.MAX_SAFE_INTEGER;
            const rightStateRank = PLAN_STATE_ORDER[right.state] ?? Number.MAX_SAFE_INTEGER;

            if (leftStateRank !== rightStateRank) return leftStateRank - rightStateRank;
            return (left.step_index ?? Number.MAX_SAFE_INTEGER) - (right.step_index ?? Number.MAX_SAFE_INTEGER);
        });
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