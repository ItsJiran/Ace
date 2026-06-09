/**
 * Thought Node — Observe, assess, classify, and route.
 *
 * Uses structured output to produce:
 *   - thought: observation of the current state
 *   - action_type: which sub-action to route to
 *   - action_reason: why that action was chosen
 *
 * Replaces the old thought → action → review loop with thought → sub-action → thought.
 *
 * Flow: START → thought → [action_speak|action_tool|action_context|action_mcp]
 *                                          ↓
 *                                     thought (loop) or END (action_type === "end")
 */

import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { Command, END, getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import type { AceAgentV3State } from '../../types';

// ── Structured output ─────────────────────────────────────────────────────

const ThoughtAction = z.object({
    thought: z
        .string()
        .describe(
            'Concise observation of the current state (1-3 sentences). ' +
            'What does the user want? What has been done? What remains? ' +
            'Be specific and reference previous results.',
        ),
    action_type: z
        .enum(['action_speak', 'action_tool', 'action_context', 'action_mcp', 'end'])
        .describe(
            'The target node to route to:\n' +
            '- action_speak — respond to the user with a natural message.\n' +
            '- action_tool — execute code, shell commands, install packages.\n' +
            '- action_context — read files, inspect config, gather info.\n' +
            '- action_mcp — external tools via MCP protocol.\n' +
            '- end — terminate the session (request fully satisfied).',
        ),
    action_reason: z
        .string()
        .describe('One-sentence justification for why this action_type was chosen.'),
});

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_CYCLES = 20;

const TARGET_MAP: Record<string, string> = {
    action_speak: 'action_speak',
    action_tool: 'action_tool',
    action_context: 'action_context',
    action_mcp: 'action_mcp',
    end: 'action_end',
};

// ── Prompt ────────────────────────────────────────────────────────────────

function thoughtPrompt(state: AceAgentV3State): string {
    const cycles = state.cycles ?? [];
    const lastCycle = cycles[cycles.length - 1];
    const lastMsg = state.messages?.[state.messages.length - 1];
    const lastActionResult = typeof lastMsg?.content === 'string'
        ? lastMsg.content.slice(0, 500)
        : undefined;

    const lines = [
        'You are an AI agent. Observe the current state, then decide the next action.',
        '',
        `### User Request`,
        `"${state.original_prompt}"`,
        '',
    ];

    if (cycles.length === 0) {
        lines.push(
            '### First Cycle — No History',
            '- This is a fresh request. Analyze what the user wants.',
            '- Is it a simple greeting, a factual question, or a complex task?',
            '- CRITICAL: NEVER end on the first cycle. You must execute an action first.',
        );
    } else {
        lines.push(
            '',
            '### Cycle History',
            ...cycles.slice(-5).map((c, i) =>
                `  ${cycles.length - 4 + i}. "${c.subject}" → ${c.action.target.name} → "${c.action.target.reason}"`,
            ),
        );

        if (lastActionResult) {
            lines.push(
                '',
                '### Last Action Output',
                `"${lastActionResult}"`,
            );
        }

        if (lastCycle?.action?.result) {
            lines.push(
                '',
                '### Last Action Result',
                `${JSON.stringify(lastCycle.action.result).slice(0, 300)}`,
            );
        }
    }

    if (state.target_node_reason) {
        lines.push('', `Re-entry context: "${state.target_node_reason}"`);
    }

    lines.push(
        '',
        '### Decision Rules',
        '- If the previous action failed or was unavailable ("⏳" or "sedang dalam tahap pengembangan"), choose a DIFFERENT action.',
        '- Simple greeting / small talk / factual answer → `action_speak`.',
        '- Need to execute code or commands → `action_tool`.',
        '- Need to read files or inspect state → `action_context`.',
        '- Need external tools → `action_mcp`.',
        '- Only use `end` if the request is fully satisfied AND the final answer was already delivered to the user.',
        '',
        `Cycle: ${cycles.length + 1} / ${MAX_CYCLES}`,
        cycles.length >= MAX_CYCLES - 3 ? '⚠️ Near max cycles — prefer a finishing action.' : '',
    );

    return lines.filter(Boolean).join('\n');
}

// ── Node ───────────────────────────────────────────────────────────────────

export function createThoughtNode() {
    return async function thoughtNode(state: AceAgentV3State): Promise<Partial<AceAgentV3State> | Command> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'thought', 'ace-v3', state).catch(() => {});

        if (threadUid && !KernelEngine.readMemory(`thread:active:${threadUid}`)) {
            return new Command({ goto: END });
        }

        const cycleNum = (state.global_cycle ?? 0) + 1;

        // Hard gate
        if (cycleNum > MAX_CYCLES) {
            return {
                global_cycle: cycleNum,
                target_node: '__end__',
                from_node: 'thought',
            };
        }

        // Structured output: thought + action_type + action_reason
        const result = await invokeLLM({
            runtime: getConfig() as never,
            structuredOutput: ThoughtAction,
            messages: [new SystemMessage(thoughtPrompt(state))],
            nodeName: 'thought',
            graphName: 'ace-v3',
        });

        const thoughtStr = result?.thought ?? 'No observation.';
        const actionType = result?.action_type ?? 'action_speak';
        const actionReason = result?.action_reason ?? 'Fallback.';

        // Determine subject for this cycle
        const subject = state.target_node_reason
            || lastCycleReview(state)
            || state.original_prompt;

        // Map action type to node name (end → __end__ to go directly to END)
        const isEnd = actionType === 'end';
        const targetNode = isEnd ? '__end__' : (TARGET_MAP[actionType] ?? 'action_speak');

        // Build the cycle with all fields filled (no longer deferred to action node)
        const cycle = {
            subject,
            thought: thoughtStr,
            action: {
                thought: thoughtStr,
                target: { name: actionType, reason: actionReason },
            },
        };

        const output: Partial<AceAgentV3State> = {
            messages: [new AIMessage({
                content: `[${actionType}] ${thoughtStr.slice(0, 200)}`,
                name: 'ace-v3-thought',
            })],
            cycles: [cycle],
            current_cycle: cycle,
            global_cycle: cycleNum,
            target_node: targetNode,
            target_node_reason: actionReason,
            from_node: 'thought',
        };

        if (isEnd) {
            // Append a courtesy summary and route directly to END
            const summary = buildEndSummary(state, thoughtStr);
            output.messages!.push(new AIMessage({
                content: `✅ ${summary}`,
                name: 'ace-v3-end',
            }));
        }

        if (threadUid) emitNodeEnd(threadUid, 'thought', 'ace-v3', output, {
            cycle: cycleNum,
            action: actionType,
        }).catch(() => {});

        return output;
    };
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Derive the last actionable "result" from the state — replaced old review_result logic. */
function lastCycleReview(state: AceAgentV3State): string | undefined {
    const lastMsg = state.messages?.[state.messages.length - 1];
    if (lastMsg && typeof lastMsg.content === 'string') {
        return lastMsg.content.slice(0, 300);
    }
    return undefined;
}

/** Build a short end-of-session summary. */
function buildEndSummary(state: AceAgentV3State, finalThought: string): string {
    const totalActions = state.cycles?.length ?? 0;
    return `Session completed after ${totalActions} cycle(s). ${finalThought.slice(0, 200)}`;
}
