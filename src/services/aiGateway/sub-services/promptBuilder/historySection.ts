/**
 * Prompt Builder History Section
 *
 * Summary:
 * - renders current-turn retained memory separately from historical prior-turn memory
 * - excludes active streaming output and avoids raw assistant transcript fallback
 */

import type { AISession } from '#/schemas/ai';

export function buildCurrentTurnRetainedMemoryPrompt(session: AISession): string {
    if (!session.turns || session.turns.length === 0) return '';

    const currentTurnIndex = Math.min(session.turn_index, session.turns.length - 1);
    const currentTurn = session.turns[currentTurnIndex];
    if (!currentTurn) return '';

    const historyEntry = session.history?.[session.turn_index] ?? session.history?.[currentTurnIndex];
    const eventSummaries = getHistoryEventSummaries(historyEntry?.responses);
    const completedSteps = (session.plan ?? [])
        .filter((entry) => entry.state === session.state)
        .filter((entry) => entry.lifecycle_turn === undefined || entry.lifecycle_turn === currentTurnIndex)
        .filter((entry) => entry.is_complete)
        .map((entry) => entry.title);
    const userPrompt = currentTurn.entries?.[0]?.prompt?.trim();
    const promptSummary = historyEntry?.prompt?.trim();
    const lines: string[] = ['[CURRENT TURN RETAINED MEMORY]'];
    lines.push('This is retained operational memory for the active turn only.');
    lines.push('Use this to remember what has already been established in the current turn before reopening older turn history.');

    if (promptSummary) {
        lines.push(`- Active turn user summary: ${promptSummary}`);
    } else if (userPrompt) {
        lines.push(`- Active turn user input: ${userPrompt}`);
    }

    if (eventSummaries.length > 0) {
        lines.push(`- Current-turn assistant memory: ${eventSummaries.join(' ')}`);
    } else {
        lines.push('- Current-turn assistant memory: no completed assistant summary yet.');
    }

    if (completedSteps.length > 0) {
        lines.push(`- Completed plan steps in this state: ${completedSteps.join(' | ')}`);
    }

    return lines.join('\n');
}

export function buildHistoricalTurnMemoryPrompt(session: AISession): string {
    if (!session.turns || session.turns.length === 0) return '';

    const currentTurnIndex = Math.min(session.turn_index, session.turns.length - 1);
    const start = session.history_start_index ?? 0;
    const endExclusive = Math.min(currentTurnIndex, session.turns.length);

    if (endExclusive <= start) return '';

    const historyTurns = session.turns.slice(start, endExclusive);
    if (historyTurns.length === 0) return '';

    const lines: string[] = ['[HISTORICAL TURN MEMORY]'];
    lines.push('This is historical turn memory from earlier turns only.');
    lines.push('Use this only when the current turn retained memory is insufficient and prior-turn evidence is still relevant.');

    historyTurns.forEach((turn, idx) => {
        const turnIndex = start + idx;
        const turnNumber = turnIndex + 1;
        const historyEntry = session.history?.[turnIndex];
        const eventSummaries = getHistoryEventSummaries(historyEntry?.responses);
        const userPrompt = turn.entries?.[0]?.prompt?.trim();
        const promptSummary = historyEntry?.prompt?.trim();
        if (promptSummary) {
            lines.push(`[TURN ${turnNumber}] User Summary: ${promptSummary}`);
        } else if (userPrompt) {
            lines.push(`[TURN ${turnNumber}] User: ${userPrompt}`);
        }

        if (eventSummaries.length > 0) {
            lines.push(`[TURN ${turnNumber}] Assistant Summary: ${eventSummaries.join(' ')}`);
        }
    });

    return lines.join('\n');
}

export function buildHistoryPrompt(session: AISession): string {
    return buildHistoricalTurnMemoryPrompt(session);
}

function getHistoryEventSummaries(historyResponses: AISession['history'][number]['responses'] | undefined): string[] {
    return Array.isArray(historyResponses)
        ? historyResponses
            .slice()
            .sort((left, right) => left.index - right.index)
            .map((event) => event.summary?.trim() ?? '')
            .filter(Boolean)
        : [];
}