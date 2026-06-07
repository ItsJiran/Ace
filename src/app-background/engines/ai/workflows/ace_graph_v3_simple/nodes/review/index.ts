/**
 * Review Node — evaluates the result of the action and summarizes
 * for the next thought cycle.
 *
 * Populates current_cycle.review_result with a concise summary.
 */

import { SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import { emitNodeStart } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV3State } from '../../types';

// ── Structured output ──────────────────────────────────────────────────────

const ReviewResult = z.object({
    summary: z.string().describe(
        'Concise summary of what happened in this action. What was done, what was the result? ' +
        'This will be used by the next thought cycle as context.',
    ),
    is_complete: z.boolean().describe(
        'Whether the user request is fully satisfied. True only when all work is done.',
    ),
});

// ── Prompt ─────────────────────────────────────────────────────────────────

function reviewPrompt(state: AceAgentV3State): string {
    const cycle = state.current_cycle;
    if (!cycle) return 'No active cycle to review.';

    return [
        'Review the result of this action cycle and summarize what happened.',
        '',
        '### Cycle',
        `Subject: "${cycle.subject}"`,
        `Thought: "${cycle.thought}"`,
        `Action: ${cycle.action.target.name} — "${cycle.action.thought}"`,
        '',
        '### Instructions',
        '- Write a concise 1-2 sentence summary of what was accomplished.',
        '- Set is_complete=true ONLY if the original user request is fully done.',
        '- Be objective: note failures, partial results, or what still needs work.',
        '',
        'This summary will be used by the next thought cycle as context.',
    ].join('\n');
}

// ── Node ───────────────────────────────────────────────────────────────────

export function createReviewNode() {
    return async function reviewNode(state: AceAgentV3State): Promise<Partial<AceAgentV3State>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'review', 'ace-v3', state).catch(() => {});

        if (state.is_stopped) return { result_summary: 'Stopped.', from_node: 'review' };

        const cycle = state.current_cycle;
        if (!cycle) return { target_node: 'thought', result_summary: 'No cycle to review.', from_node: 'review' };

        const result = await invokeLLM({
            runtime: getConfig() as never,
            structuredOutput: ReviewResult,
            messages: [new SystemMessage(reviewPrompt(state))],
            nodeName: 'review',
            graphName: 'ace-v3',
        });

        const updatedCycle = { ...cycle, review_result: result.summary };
        const cycles = state.cycles ?? [];
        // Replace the last cycle with the reviewed one
        const updatedCycles = cycles.length > 0
            ? [...cycles.slice(0, -1), updatedCycle]
            : [updatedCycle];

        const output: Partial<AceAgentV3State> = {
            cycles: updatedCycles,
            current_cycle: updatedCycle,
            target_node: result.is_complete ? '__end__' : 'thought',
            target_node_reason: result.summary,
            from_node: 'review',
            result_summary: result.summary,
        };

        return output;
    };
}
