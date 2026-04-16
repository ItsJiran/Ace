/**
 * Prompt Builder Memory Sections
 *
 * Summary:
 * - renders active context, working-memory index, and expanded payload sections
 * - keeps evidence-oriented prompt sections separate from state-control sections
 */

import type { AISession } from '#/schemas/ai';
import { getActiveContextEntries, getPrioritizedWorkingMemoryEntries } from './selectors';

export function buildContextPrompt(session: AISession): string {
    const windowEntries = getActiveContextEntries(session);

    if (windowEntries.length === 0) return '';

    const lines: string[] = ['[LIST ACTIVE CONTEXT RIGHT NOW]'];
    lines.push('This is supporting evidence only, not the main control surface for the pass.');
    lines.push('Use this list only when you need factual support for the current state, current plan, or passed-off evaluation.');
    lines.push('Do not let this section override the deterministic guidance in CURRENT STATE, PLAN, or PASSED OFF PROMPT.');

    for (const entry of windowEntries) {
        const turnRef = entry.lifecycle_turn !== undefined ? ` (turn: ${entry.lifecycle_turn})` : '';
        const content = entry.content?.trim();
        lines.push(`- [${entry.title}]${turnRef}: ${content || '(no content)'}`);

        if (entry.payload && Object.keys(entry.payload).length > 0) {
            lines.push(`  Payload keys: ${Object.keys(entry.payload).join(', ')}`);
        }
    }

    return lines.join('\n');
}

export function buildMemoryPrompt(session: AISession): string {
    const prioritizedEntries = getPrioritizedWorkingMemoryEntries(session);
    if (prioritizedEntries.length === 0) return '';

    const expandedIds = new Set(prioritizedEntries.slice(0, 3).map((entry) => entry.uid));
    const lines: string[] = ['[LIST WORKING MEMORY RIGHT NOW]'];
    lines.push('This is the current working memory.');
    lines.push('Use this list to see the working payloads available for the current pass.');

    for (const entry of prioritizedEntries) {
        const turnRef = entry.lifecycle_turn !== undefined ? `turn ${entry.lifecycle_turn}` : 'turn unknown';
        const expandedLabel = expandedIds.has(entry.uid) ? ' (expanded below)' : '';
        lines.push(`- ${entry.uid}${expandedLabel}: ${entry.description} [${turnRef}]`);
    }

    return lines.join('\n');
}

export function buildExpandedWorkingMemoryPrompt(session: AISession): string {
    const expandedEntries = getPrioritizedWorkingMemoryEntries(session).slice(0, 3);
    if (expandedEntries.length === 0) return '';

    const lines: string[] = ['[EXPANDED ACTIVE PAYLOADS]'];
    lines.push('These are the highest-priority raw payloads for the current pass. Do not dig through lower-priority memory unless these are insufficient.');

    for (const entry of expandedEntries) {
        lines.push('');
        lines.push(`--- ID: ${entry.uid} ---`);
        lines.push(`Description: ${entry.description}`);
        if (entry.lifecycle_turn !== undefined) {
            lines.push(`Added at turn: ${entry.lifecycle_turn}`);
        }
        lines.push(`Content:\n${entry.content}`);
        lines.push('-----------------------');
    }

    return lines.join('\n');
}