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
import { buildErrorRecoveryCommand } from '../recovery-error-helper';
import type { AceAgentV3State, ThoughtCycle } from '../../types';

// ── Structured output ─────────────────────────────────────────────────────

const ThoughtAction = z.object({
    thought: z
        .string()
        .describe(
            'Concise observation of the current state (1-3 sentences). ' +
            'What does the user want? What has been done? What remains? ' +
            'Be specific and reference previous results.',
        ),
    action_types: z
        .string()
        .describe(
            'Comma-separated list of actions to run in this cycle.\n' +
            'Available: action_speak, action_tool, action_context, action_mcp, end.\n' +
            'Example: "action_speak, action_memory" (reply AND store info).\n' +
            'Single action: "action_speak". End: "end".\n' +
            'All actions run sequentially BEFORE the next thought cycle.',
        ),
    action_reason: z
        .string()
        .describe('One-sentence justification for why these actions were chosen (covers all actions in the batch).'),
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
            '### Cycle History — What Has Already Been Done',
            'Each cycle shows: what was analyzed → actions executed → why.',
            'Actions in [brackets] ran sequentially within one cycle.',
            '',
            'Format: [#]. "[subject]" → [action, action] → "[reason]"',
            '',
            ...cycles.slice(-5).map((c, i) => {
                const num = cycles.length - 4 + i;
                const actionList = (c.actions ?? []).map(a => a.target.name).join(', ');
                return `  ${num}. "${c.subject.slice(0, 100)}" → [${actionList}] → "${(c.actions ?? [])[0]?.target.reason.slice(0, 100) ?? ''}"`;
            }),
        );

        lines.push(
            '',
            '👉 If the most recent cycle already delivered a FINAL ANSWER to the user',
            '(action_speak with a complete reply), you can use `action_type: "end"`.',
            'Otherwise, decide what still needs to be done.',
        );

        if (lastActionResult) {
            lines.push(
                '',
                '### Last Action Output (raw XML from previous cycle)',
                `${lastActionResult}`,
            );
        }

        if (lastCycle?.actions?.[0]?.result) {
            lines.push(
                '',
                '### Last Action Result',
                `${JSON.stringify(lastCycle.actions[0].result).slice(0, 300)}`,
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
        try {
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
        const { resolved, message } = await invokeLLM({
            runtime: getConfig() as never,
            structuredOutput: ThoughtAction,
            messages: [new SystemMessage(thoughtPrompt(state))],
            nodeName: 'thought',
            graphName: 'ace-v3',
        });

        const thoughtStr = resolved?.thought ?? 'No observation.';
        const actionTypesRaw: string = resolved?.action_types ?? 'action_speak';
        const actionReason = resolved?.action_reason ?? 'Fallback.';

        // Parse comma-separated action list: "action_speak, action_context" → actions[]
        const actionNames = actionTypesRaw
            .split(',')
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0);

        const actions = actionNames.map((name: string, idx: number) => ({
            thought: thoughtStr,
            target: { name, reason: actionReason },
            status: 'pending' as const,
        }));

        // Route to action_dispatcher — it will iterate through the actions array
        const targetNode = 'action_dispatcher';

        // Determine subject for this cycle
        const subject = state.target_node_reason
            || lastCycleReview(state)
            || state.original_prompt;

        // Build the cycle with batched actions
        const cycle: ThoughtCycle = {
            subject,
            thought: thoughtStr,
            actions,
        };

        const output: Partial<AceAgentV3State> = {
            messages: [message],
            cycles: [cycle],
            current_cycle: cycle,
            global_cycle: cycleNum,
            target_node: targetNode,
            target_node_reason: actionReason,
            from_node: 'thought',
        };

        if (threadUid) emitNodeEnd(threadUid, 'thought', 'ace-v3', output, {
            cycle: cycleNum,
            actions: actionNames,
        }).catch(() => {});

        return output;
        } catch (error) {
            console.error('[thought] Error:', error);
            return buildErrorRecoveryCommand(error, 'thought');
        }
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
