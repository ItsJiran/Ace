/**
 * Prompt Builder History Section
 *
 * Summary:
 * - renders turn-level prompt memory using compact user summaries and history events
 * - excludes active streaming output and avoids raw assistant transcript fallback
 */

import type { AISession } from '#/schemas/ai';

export function buildHistoryPrompt(session: AISession): string {
    if (!session.turns || session.turns.length === 0) return '';

    const start = session.history_start_index ?? 0;
    const endExclusive = Math.min(session.turn_index + 1, session.turns.length);

    if (endExclusive <= start) return '';

    const historyTurns = session.turns.slice(start, endExclusive);
    if (historyTurns.length === 0) return '';

    const lines: string[] = ['[LIST TURN MEMORY RIGHT NOW]'];
    lines.push('This is the turn memory currently available.');
    lines.push('Use this summary to understand the progress that already happened in the active turn and earlier turns.');

    historyTurns.forEach((turn, idx) => {
        const turnIndex = start + idx;
        const turnNumber = turnIndex + 1;
        const historyEntry = session.history?.[turnIndex];
        const eventSummaries = Array.isArray(historyEntry?.responses)
            ? historyEntry.responses
                .slice()
                .sort((left, right) => left.index - right.index)
                .map((event) => event.summary?.trim() ?? '')
                .filter(Boolean)
            : [];
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