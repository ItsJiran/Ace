/**
 * Review Node — evaluates the action result.
 *
 * Quick heuristic: [UNAVAILABLE] → auto-redirect to action node.
 * Otherwise → summarize via LLM → route to thought (next cycle).
 */

import { SystemMessage } from '@langchain/core/messages';
import { Command, END, getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import { emitNodeStart } from '#/app-background/lib/utils/ai/emit-graph-event';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import type { AceAgentV3State } from '../../types';

// ── Structured output ─────────────────────────────────────────────────────

const ReviewResult = z.object({
    summary: z.string().describe(
        'Concise 1-2 sentence summary of what happened. What was done, what was the result?\n' +
        'Examples:\n' +
        '  - "User was greeted successfully with a friendly response."\n' +
        '  - "package.json was read — Express is not yet installed."\n' +
        '  - "npm install express completed successfully — Express 4.21 added to dependencies."',
    ),
});

// ── Prompt ────────────────────────────────────────────────────────────────

function reviewPrompt(state: AceAgentV3State): string {
    const cycle = state.current_cycle;
    if (!cycle) return 'No active cycle to review.';

    // Read the action result from the last message
    const msgs = state.messages ?? [];
    const lastMsg = msgs[msgs.length - 1];
    const actionResult = typeof lastMsg?.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg?.content ?? 'No output.');

    return [
        'Summarize what happened in this action cycle.',
        '',
        '### Action',
        `Target: ${cycle.action.target.name}`,
        `Plan: "${cycle.action.thought}"`,
        `Output: "${actionResult.slice(0, 300)}"`,
        '',
        '### Context',
        `User request: "${state.original_prompt}"`,
        `Agent analysis: "${cycle.thought}"`,
        '',
        '### Instructions',
        '- Write a concise 1-2 sentence summary of what was accomplished.',
        '- Be objective: note what was done and what the outcome was.',
        '- This summary will be used by the next thought cycle.',
    ].join('\n');
}

// ── Node ───────────────────────────────────────────────────────────────────

export function createReviewNode() {
    return async function reviewNode(state: AceAgentV3State): Promise<Partial<AceAgentV3State> | Command> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'review', 'ace-v3', state).catch(() => {});

        if (threadUid && !KernelEngine.readMemory(`thread:active:${threadUid}`)) {
            return new Command({ goto: END });
        }

        const cycle = state.current_cycle;
        if (!cycle) return { target_node: 'thought', from_node: 'review' };

        // Quick heuristic: [UNAVAILABLE] in last message → redirect back to action
        const msgs = state.messages ?? [];
        const lastContent = typeof msgs[msgs.length - 1]?.content === 'string'
            ? msgs[msgs.length - 1].content as string
            : '';
        const isUnavailable = lastContent.startsWith('⏳') || lastContent.includes('sedang dalam tahap pengembangan');

        if (isUnavailable) {
            const failureReason = `Action ${cycle.action.target.name} is not yet implemented.`;
            const updatedCycle = { ...cycle, review_result: `[FAILED] ${failureReason}` };
            const cycles = state.cycles ?? [];
            const updatedCycles = cycles.length > 0
                ? [...cycles.slice(0, -1), updatedCycle]
                : [updatedCycle];

            return {
                cycles: updatedCycles,
                current_cycle: updatedCycle,
                target_node: 'action',
                target_node_reason: failureReason,
                from_node: 'review',
            };
        }

        // Summarize
        const result = await invokeLLM({
            runtime: getConfig() as never,
            structuredOutput: ReviewResult,
            messages: [new SystemMessage(reviewPrompt(state))],
            nodeName: 'review',
            graphName: 'ace-v3',
        });

        const summary = result?.summary ?? 'Action completed.';

        const updatedCycle = { ...cycle, review_result: summary };
        const cycles = state.cycles ?? [];
        const updatedCycles = cycles.length > 0
            ? [...cycles.slice(0, -1), updatedCycle]
            : [updatedCycle];

        return {
            cycles: updatedCycles,
            current_cycle: updatedCycle,
            target_node: 'thought',
            target_node_reason: summary,
            from_node: 'review',
        };
    };
}
