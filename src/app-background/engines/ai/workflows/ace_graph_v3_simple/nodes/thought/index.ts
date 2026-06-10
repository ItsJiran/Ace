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
import { ParsingXMLError, serializeAgentError } from '#/shared/lib/agent-errors';
import {
    buildSystemIntro,
    buildMemorySection,
    buildStepSection,
    buildFirstCyclePrompt,
    buildCycleHistory,
    buildLastCycleHighlight,
    buildDecisionRules,
    buildMemoryExtractionRules,
    preFetchExpandedData,
    type ExpandedCycleMap,
} from '#/app-background/lib/utils/ai/prompt-builders';
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
            'Available: action_speak, action_tool, action_memory, action_mcp,\n' +
            '           action_write_file, action_shell, action_read_file, action_step, end.\n' +
            'RULES:\n' +
            '- action_speak: MAX 2 per cycle (intro + summary pattern).\n' +
            '- action_memory: MAX 1 per cycle. Put ALL memory operations into ONE reason.\n' +
            '- action_step: MAX 1 per cycle. Use for step plan CRUD. When using action_step,\n' +
            '  do NOT include other actions in the same cycle — plan first, execute later.\n' +
            '- Each action type appears AT MOST ONCE per cycle (except action_speak: max 2).\n' +
            'Example: "action_speak, action_memory" (reply + store facts).\n' +
            'Example: "action_speak, action_tool, action_speak" (announce → execute → report).\n' +
            'Example: "action_step" (plan only — no other actions in this cycle).\n' +
            'All actions run sequentially BEFORE the next thought cycle.',
        ),
    action_reason: z
        .string()
        .describe(
            'Per-action justifications. One reason per action in action_types.\n' +
            'Format: "action_speak: <reason> | action_memory: <reason>"\n' +
            'Each reason should be specific to THAT action — not a generic batch reason.\n' +
            'For action_speak: match the USER\'S language. If user writes in Indonesian, the reason should reflect Indonesian.\n' +
            'Example: "action_speak: Sapa user dengan hangat dalam Bahasa Indonesia | action_memory: Simpan user_name=Alex sebagai fakta"',
        ),
});

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_CYCLES = 20;

// ── Thought Prompt ─────────────────────────────────────────────────────────

function thoughtPrompt(
    state: AceAgentV3State,
    expandedData: ExpandedCycleMap,
): string {
    const cycles = state.cycles ?? [];
    const cycleNum = cycles.length + 1;

    const sections: string[][] = [
        buildSystemIntro(state),
        buildMemorySection(state),
        buildStepSection(state),
        cycles.length === 0
            ? buildFirstCyclePrompt()
            : [
                ...buildCycleHistory(cycles, expandedData),
                ...buildLastCycleHighlight(cycles),
              ],
    ];

    if (state.target_node_reason) {
        sections.push([`Re-entry context: "${state.target_node_reason}"`, '']);
    }

    sections.push(buildDecisionRules(cycleNum, MAX_CYCLES));
    sections.push(buildMemoryExtractionRules());

    return sections.flat().filter(Boolean).join('\n');
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

        // Pre-fetch expanded output/results from last 3 cycles
        const cycles = state.cycles ?? [];
        const expandedData = await preFetchExpandedData(cycles);

        // Structured output: thought + action_type + action_reason
        const { resolved, message, parseError } = await invokeLLM({
            runtime: getConfig() as never,
            structuredOutput: ThoughtAction,
            messages: [new SystemMessage(thoughtPrompt(state, expandedData))],
            nodeName: 'thought',
            graphName: 'ace-v3',
        });

        // ── Parse exhausted? Route to recovery_error without throwing ──
        if (resolved === null && parseError) {
            const serialized = serializeAgentError(
                new ParsingXMLError(parseError, 'thought'),
                'thought',
            );
            if (threadUid) emitNodeEnd(threadUid, 'thought', 'ace-v3', {}, { parseError }).catch(() => {});
            return new Command({
                update: {
                    target_node: 'recovery_error',
                    target_node_reason: JSON.stringify(serialized),
                    from_node: 'thought',
                } as any,
                goto: 'recovery_error',
            });
        }

        const thoughtStr = resolved?.thought ?? 'No observation.';
        const actionTypesRaw: string = resolved?.action_types ?? 'action_speak';
        const actionReasonsRaw: string = resolved?.action_reason ?? '';

        // Parse comma-separated action list: "action_speak, action_context" → actions[]
        const actionNames = actionTypesRaw
            .split(',')
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0);

        // Parse per-action reasons: "action_speak: greet | action_memory: store name"
        const reasonMap: Record<string, string> = {};
        const reasonParts = actionReasonsRaw.split('|').map(s => s.trim()).filter(Boolean);
        for (const part of reasonParts) {
            const colonIdx = part.indexOf(':');
            if (colonIdx > 0) {
                const actionKey = part.slice(0, colonIdx).trim();
                const reasonText = part.slice(colonIdx + 1).trim();
                reasonMap[actionKey] = reasonText;
            }
        }

        const actions = actionNames.map((name: string) => ({
            thought: thoughtStr,
            target: {
                name,
                reason: reasonMap[name] || reasonMap[name.replace(/^action_/, '')] || `Execute ${name}.`,
            },
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
            target_node_reason: actionReasonsRaw,
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
