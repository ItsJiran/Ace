/**
 * Thought Node — the central brain. Every cycle starts here.
 *
 * Stage 1: Analyze subject → internal monologue
 * Stage 2: Classify action → target node + reason
 *
 * Flow: START → thought → action → review → thought (loop) or END
 */

import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV3State } from '../../types';

// ── Structured outputs ─────────────────────────────────────────────────────

const InternalThought = z.object({
    thought: z.string().describe(
        'Internal monologue: analyze the subject. Consider previous cycles, what has been done, what remains.',
    ),
});

const ActionClassify = z.object({
    action_thought: z.string().describe('What the agent intends to do based on the analysis.'),
    target_name: z.string().describe(
        'Target node: action_tool (execute code/commands), ' +
        'action_context (gather info/read files), ' +
        'action_mcp (model context protocol), ' +
        'action_speak (respond to user), end (done).',
    ),
    target_reason: z.string().describe('Why this target was chosen.'),
});

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_CYCLES = 20;

// ── Prompts ────────────────────────────────────────────────────────────────

function analyzePrompt(state: AceAgentV3State): string {
    const cycles = state.cycles ?? [];
    const lastCycle = cycles[cycles.length - 1];

    const lines = [
        'You are an AI agent analyzing what to do next.',
        '',
        `User request: "${state.original_prompt}"`,
    ];

    if (cycles.length > 0) {
        lines.push(
            '',
            '### Previous Cycles',
            ...cycles.slice(-5).map((c, i) =>
                `  ${cycles.length - 4 + i}. Subject: "${c.subject}" → Action: ${c.action.target.name} → Result: "${c.review_result ?? 'pending'}"`,
            ),
        );
    }

    if (lastCycle?.review_result) {
        lines.push(
            '',
            '### Last Result',
            `"${lastCycle.review_result}"`,
        );
    }

    if (state.target_node_reason) {
        lines.push(
            '',
            '### Context',
            `Re-entry reason: "${state.target_node_reason}"`,
        );
    }

    lines.push(
        '',
        '### Instructions',
        '- Analyze what has been done and what still needs to be accomplished.',
        '- Consider the user request, previous cycles, and last result.',
        '- Be honest: if done, say so. If stuck, acknowledge it.',
        `- Cycle: ${cycles.length + 1} / ${MAX_CYCLES}.`,
    );

    return lines.join('\n');
}

function classifyPrompt(state: AceAgentV3State, thought: string): string {
    const cycles = state.cycles ?? [];

    return [
        'Based on your analysis, classify the NEXT action.',
        '',
        `Your thought: "${thought}"`,
        '',
        '### Target Guide',
        '- `action_tool` — execute code, run commands, modify files, install packages.',
        '- `action_context` — gather information: read files, check config, inspect state.',
        '- `action_mcp` — use Model Context Protocol for external tool integration.',
        '- `action_speak` — respond to the user with a message.',
        '- `end` — the user request is fully satisfied. No more actions needed.',
        '',
        `Cycles used: ${cycles.length} / ${MAX_CYCLES}.`,
        cycles.length >= MAX_CYCLES - 3 ? 'WARNING: approaching max cycles. Choose "end" unless critical work remains.' : '',
        '',
        'Provide action_thought (what to do) and target (where to route).',
    ].filter(Boolean).join('\n');
}

// ── Node ───────────────────────────────────────────────────────────────────

export function createThoughtNode() {
    return async function thoughtNode(state: AceAgentV3State): Promise<Partial<AceAgentV3State>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'thought', 'ace-v3', state).catch(() => {});

        if (state.is_stopped) return { result_summary: 'Stopped.', from_node: 'thought' };

        const cycleNum = (state.global_cycle ?? 0) + 1;

        // Hard gate
        if (cycleNum > MAX_CYCLES) {
            return {
                global_cycle: cycleNum,
                target_node: '__end__',
                from_node: 'thought',
                result_summary: `Max cycles (${MAX_CYCLES}) reached.`,
            };
        }

        // Stage 1: Analyze
        const analyze = await invokeLLM({
            runtime: getConfig() as never,
            structuredOutput: InternalThought,
            messages: [new SystemMessage(analyzePrompt(state))],
            nodeName: 'thought',
            graphName: 'ace-v3',
        });

        // Stage 2: Classify
        const classify = await invokeLLM({
            runtime: getConfig() as never,
            structuredOutput: ActionClassify,
            messages: [new SystemMessage(classifyPrompt(state, analyze.thought))],
            nodeName: 'thought',
            graphName: 'ace-v3',
        });

        const subject = state.target_node_reason
            || state.cycles?.[state.cycles.length - 1]?.review_result
            || state.original_prompt;

        const cycle = {
            subject,
            thought: analyze.thought,
            action: {
                thought: classify.action_thought,
                target: {
                    name: classify.target_name,
                    reason: classify.target_reason,
                },
            },
        };

        const output: Partial<AceAgentV3State> = {
            messages: [new AIMessage({
                content: `[${classify.target_name}] ${analyze.thought.slice(0, 100)}`,
                name: 'ace-v3-thought',
            })],
            cycles: [cycle],
            current_cycle: cycle,
            global_cycle: cycleNum,
            target_node: classify.target_name === 'end' ? '__end__' : 'action',
            target_node_reason: classify.target_reason,
            from_node: 'thought',
            result_summary: analyze.thought,
        };

        if (threadUid) emitNodeEnd(threadUid, 'thought', 'ace-v3', output, {
            target: classify.target_name,
            cycle: cycleNum,
        }).catch(() => {});

        return output;
    };
}
