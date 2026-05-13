import type { AIHistoryEntry, AISessionRuntime } from '#/schemas/ai';

export function appendHistoryResponseSummary(
    sessionState: AISessionRuntime,
    turnIndex: number,
    summary: string,
    payload?: Record<string, unknown>,
): Record<number, AIHistoryEntry> {
    const history = { ...(sessionState.history ?? {}) };
    const existingEntry = history[turnIndex];
    const nextResponses = [...(existingEntry?.responses ?? [])];
    const nextIndex = nextResponses.reduce((max, event) => Math.max(max, event.index), -1) + 1;
    const now = Date.now();
    nextResponses.push({
        index: nextIndex,
        block_slug: typeof payload?.action === 'string' ? String(payload.action).split(':')[0].replace(/_/g, '-') : 'system',
        status: 'completed',
        summary: summary.trim(),
        at: now,
        updated_at: now,
        payload,
    });

    history[turnIndex] = {
        at: now,
        turn_index: turnIndex,
        status: 'active',
        lifecycle_turn: sessionState.turn_index,
        prompt: existingEntry?.prompt,
        responses: nextResponses,
        payload: existingEntry?.payload,
    };

    return history;
}

export function allocateHistoryEventSlot(
    sessionState: AISessionRuntime,
    turnIndex: number,
    input: {
        block_slug: string;
        entry_index?: number;
        block_index?: number;
    },
): { history: Record<number, AIHistoryEntry>; historyEventIndex: number } {
    const history = { ...(sessionState.history ?? {}) };
    const existingEntry = history[turnIndex];
    const payload = { ...(existingEntry?.payload ?? {}) };
    const events = [...(existingEntry?.responses ?? [])];

    const existingEvent = events.find((event) => (
        event.block_slug === input.block_slug
        && event.entry_index === input.entry_index
        && event.block_index === input.block_index
    ));

    if (existingEvent) {
        return { history, historyEventIndex: existingEvent.index };
    }

    const now = Date.now();
    const historyEventIndex = events.reduce((max, event) => Math.max(max, event.index), -1) + 1;
    events.push({
        index: historyEventIndex,
        block_slug: input.block_slug,
        entry_index: input.entry_index,
        block_index: input.block_index,
        status: 'allocated',
        at: now,
        updated_at: now,
    });

    history[turnIndex] = {
        at: now,
        turn_index: turnIndex,
        status: 'active',
        lifecycle_turn: sessionState.turn_index,
        prompt: existingEntry?.prompt,
        responses: events,
        payload,
    };

    return { history, historyEventIndex };
}

export function writeHistoryEventSummary(
    sessionState: AISessionRuntime,
    turnIndex: number,
    historyEventIndex: number,
    summary: string,
    payload?: Record<string, unknown>,
    options?: { mirrorToResponse?: boolean; status?: 'completed' | 'aborted'; block_slug?: string },
): Record<number, AIHistoryEntry> {
    const history = { ...(sessionState.history ?? {}) };
    const existingEntry = history[turnIndex];
    const nextPayload = { ...(existingEntry?.payload ?? {}) };
    const events = [...(existingEntry?.responses ?? [])];
    const eventIndex = events.findIndex((event) => event.index === historyEventIndex);
    const now = Date.now();
    const nextEvent = {
        ...(eventIndex >= 0 ? events[eventIndex] : {
            index: historyEventIndex,
            block_slug: options?.block_slug ?? 'unknown',
            status: 'allocated' as const,
            at: now,
            updated_at: now,
        }),
        status: options?.status ?? 'completed',
        summary: summary.trim(),
        updated_at: now,
        payload: {
            ...((eventIndex >= 0 ? events[eventIndex]?.payload : {}) ?? {}),
            ...(payload ?? {}),
        },
    };

    if (eventIndex >= 0) {
        events[eventIndex] = nextEvent;
    } else {
        events.push(nextEvent);
    }

    history[turnIndex] = {
        at: now,
        turn_index: turnIndex,
        status: 'active',
        lifecycle_turn: sessionState.turn_index,
        prompt: existingEntry?.prompt,
        responses: events,
        payload: nextPayload,
    };

    return history;
}