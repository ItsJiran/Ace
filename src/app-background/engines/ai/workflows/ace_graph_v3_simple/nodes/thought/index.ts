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
import { readActionResult, readActionOutput } from '#/app-background/lib/utils/thread-storage';
import { ParsingXMLError, serializeAgentError } from '#/shared/lib/agent-errors';
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
            '           action_write_file, action_shell, action_read_file, end.\n' +
            'Example: "action_speak, action_memory" (reply AND store info).\n' +
            'Single action: "action_speak". End: "end".\n' +
            'All actions run sequentially BEFORE the next thought cycle.',
        ),
    action_reason: z
        .string()
        .describe(
            'Per-action justifications. One reason per action in action_types.\n' +
            'Format: "action_speak: <reason> | action_memory: <reason>"\n' +
            'Each reason should be specific to THAT action — not a generic batch reason.\n' +
            'Example: "action_speak: Greet the user warmly | action_memory: Store user_name=Jiran as fact"',
        ),
});

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_CYCLES = 20;

// ── Expanded data types for inline output/result ──────────────────────────

interface ExpandedActionData {
    output?: string;
    result?: string;
}

type ExpandedCycleMap = Map<number, Map<number, ExpandedActionData>>;

// ── Prompt Sub-Builders ───────────────────────────────────────────────────

function buildSystemIntro(state: AceAgentV3State): string[] {
    return [
        'You are an AI agent. Observe the current state, then decide the next action.',
        '',
        '### User Request',
        `"${state.original_prompt}"`,
        '',
    ];
}

function buildMemorySection(state: AceAgentV3State): string[] {
    const expanded = (state.memories ?? []).filter(m => m.is_expanded);
    if (expanded.length === 0) return [];
    return [
        '### Active Memories (injected from memory hub)',
        ...expanded.map(m => `- [${m.key}] (${m.type}) "${m.content}"`),
        '',
    ];
}

function buildFirstCyclePrompt(): string[] {
    return [
        '### First Cycle — No History',
        '- This is a fresh request. Analyze what the user wants.',
        '- Is it a simple greeting, a factual question, or a complex task?',
        '- CRITICAL: NEVER end on the first cycle. You must execute an action first.',
        '',
    ];
}

function buildCycleHistory(
    cycles: AceAgentV3State['cycles'],
    expandedData: ExpandedCycleMap,
): string[] {
    const lines: string[] = [];
    const recentStart = Math.max(0, (cycles ?? []).length - 3);

    lines.push(
        '### Cycle History — What Has Already Been Done',
        'Each cycle below shows the thought, its actions, and results.',
        'Actions marked with output/result are from recent cycles (last 3).',
        '',
    );

    for (let ci = 0; ci < (cycles ?? []).length; ci++) {
        const c = cycles![ci];
        const num = ci + 1;
        const isRecent = ci >= recentStart;

        lines.push(
            `--- Thought (${num}) ---`,
            `Subject (${num}): ${(c.subject ?? '').slice(0, 200)}`,
            `Thought (${num}): ${(c.thought ?? '').slice(0, 200)}`,
        );

        if (isRecent && (c.actions ?? []).length > 0) {
            lines.push(`  This is actions for thought (${num}):`);

            for (let ai = 0; ai < (c.actions ?? []).length; ai++) {
                const a = c.actions![ai];
                const actionNum = ai + 1;

                lines.push(
                    `  Thought (${num}) Action (${actionNum})`,
                    `    target  : ${a.target.name}`,
                    `    reason  : ${(a.target.reason ?? '').slice(0, 150)}`,
                );

                const exp = expandedData.get(ci)?.get(ai);
                if (exp?.output) {
                    lines.push(`    output  : ${exp.output.slice(0, 200)}`);
                }
                if (exp?.result) {
                    lines.push(`    result  : ${exp.result.slice(0, 200)}`);
                }
            }
        } else if ((c.actions ?? []).length > 0) {
            const actionList = (c.actions ?? []).map(a => a.target.name).join(', ');
            lines.push(`  Actions: [${actionList}]`);
        }

        if (c.result_summary) {
            lines.push(`  Review Result: ${c.result_summary.slice(0, 250)}`);
        }

        lines.push('');
    }

    return lines;
}

function buildLastCycleHighlight(cycles: AceAgentV3State['cycles']): string[] {
    if (!cycles || cycles.length === 0) return [];
    const lastIdx = cycles.length - 1;
    const last = cycles[lastIdx];

    return [
        '### ═══════════════════════════════════════════',
        '### This Is The Last Cycle History — Pay Close Attention',
        `The most recent cycle was Thought (${lastIdx + 1}).`,
        'Analyze what just happened in this cycle:',
        '- Did the actions succeed? Look at the output/result above.',
        '- Is more work needed to fulfill the user request?',
        '- What should the NEXT action be, based on this last result?',
        ...(last.result_summary
            ? [`Last cycle review summary: ${last.result_summary}`]
            : []),
        '### ═══════════════════════════════════════════',
        '',
    ];
}

function buildDecisionRules(cycleNum: number, maxCycles: number): string[] {
    return [
        '### Decision Rules',
        '',
        '**Sequence Analysis** — Before choosing actions, analyze the history SEQUENCE BY SEQUENCE:',
        '1. Look at Thought (1) through Thought (N) — track how the agent progressed toward the user\'s goal.',
        '2. For each cycle, check: did the actions succeed? Did the output/result indicate completion or failure?',
        '3. If a previous action failed or returned an error, do NOT repeat the same action — choose a DIFFERENT approach.',
        '4. Connect context across cycles: if Thought (2) already read a file, Thought (3) should use that context, not re-read.',
        '5. The sequence must show PROGRESS — each cycle should move closer to fulfilling the original request.',
        '6. If the last cycle\'s result already satisfies the request, use `end`.',
        '',
        '**Action Selection Guide:**',
        '- Simple greeting / small talk / factual answer → `action_speak`.',
        '- Need to execute code or commands → `action_tool`.',
        '- Need to manage or recall memories → `action_memory`.',
        '- Need to read a file → `action_read_file`.',
        '- Need to write/create a file → `action_write_file`.',
        '- Need to run shell commands → `action_shell`.',
        '- Need external tools → `action_mcp`.',
        '- Only use `end` if the request is FULLY satisfied AND the final answer was delivered to the user.',
        '',
        `Cycle: ${cycleNum} / ${maxCycles}`,
        cycleNum >= maxCycles - 2 ? '⚠️ Near max cycles — prefer a finishing action.' : '',
        '',
    ];
}

function buildMemoryExtractionRules(): string[] {
    return [
        '### Memory Extraction — When to batch `action_memory`',
        'If the user mentions ANY key information, batch `action_memory` alongside your response:',
        '',
        '| Trigger | Example | Memory key → value |',
        '|----------|---------|--------------------|',
        '| Personal info | "I\'m Jiran" | user_name → "Jiran" |',
        '| Preferences | "I prefer Fastify" | pref_framework → "Fastify" |',
        '| Project context | "My project uses Postgres" | proj_database → "Postgres" |',
        '| Environment | "Running on Ubuntu" | env_os → "Ubuntu" |',
        '| Workflow choices | "Dont use Docker" | pref_no_docker → "true" |',
        '| File/dir locations | "Config is in ~/.config/ace" | dir_config → "~/.config/ace" |',
        '',
        'Pattern: greeting → action_types: "action_speak, action_memory"  (reply AND remember)',
        'Pattern: task → action_types: "action_tool, action_memory"  (execute AND store result)',
        '',
    ];
}

function thoughtPrompt(
    state: AceAgentV3State,
    expandedData: ExpandedCycleMap,
): string {
    const cycles = state.cycles ?? [];
    const cycleNum = cycles.length + 1;

    const sections: string[][] = [
        buildSystemIntro(state),
        buildMemorySection(state),
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

        // Pre-fetch expanded output/results from last 3 cycles (structured by cycle+action index)
        const expandedData: ExpandedCycleMap = new Map();
        const cycles = state.cycles ?? [];
        const recentStart = Math.max(0, cycles.length - 3);
        for (let ci = recentStart; ci < cycles.length; ci++) {
            const c = cycles[ci];
            const actionMap = new Map<number, ExpandedActionData>();
            for (let ai = 0; ai < (c.actions ?? []).length; ai++) {
                const a = c.actions![ai];
                const data: ExpandedActionData = {};
                if (a.output) {
                    const d = await readActionOutput(a.output);
                    if (d) data.output = JSON.stringify(d);
                }
                if (a.result) {
                    const d = await readActionResult(a.result);
                    if (d) data.result = JSON.stringify(d);
                }
                if (data.output || data.result) {
                    actionMap.set(ai, data);
                }
            }
            if (actionMap.size > 0) {
                expandedData.set(ci, actionMap);
            }
        }

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
