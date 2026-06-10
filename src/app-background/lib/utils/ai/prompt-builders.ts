/**
 * Shared Prompt Builders — reusable prompt fragments for all agent nodes.
 *
 * Extracted from thought/index.ts so action_speak, action_memory, etc.
 * can all use the same cycle history, memory, and context formatting.
 */

import type { AceAgentV3State } from '#/app-background/engines/ai/workflows/ace_graph_v3_simple/types';
import { readActionOutput, readActionResult } from '#/app-background/lib/utils/thread-storage';

// ── Expanded data types for inline output/result ──────────────────────────

export interface ExpandedActionData {
    output?: string;
    result?: string;
}

export type ExpandedCycleMap = Map<number, Map<number, ExpandedActionData>>;

// ── System Intro ──────────────────────────────────────────────────────────

export function buildSystemIntro(state: AceAgentV3State): string[] {
    return [
        'You are an AI agent. Observe the current state, then decide the next action.',
        '',
        '### User Request',
        `"${state.original_prompt}"`,
        '',
    ];
}

// ── Memory Section ────────────────────────────────────────────────────────

export function buildMemorySection(state: AceAgentV3State): string[] {
    const expanded = (state.memories ?? []).filter(m => m.is_expanded);
    if (expanded.length === 0) return [];
    return [
        '### Active Memories (injected from memory hub)',
        ...expanded.map(m => `- [${m.key}] (${m.type}) "${m.content}"`),
        '',
    ];
}

// ── Context Section ────────────────────────────────────────────────────────

export function buildContextSection(state: AceAgentV3State): string[] {
    const ctx = state.contexts ?? [];
    if (ctx.length === 0) return [];
    const lines: string[] = ['### Active Contexts'];
    for (const c of ctx) {
        if (c.type === 'file') {
            const contentLen = typeof c.content === 'string' ? c.content.length : 0;
            lines.push(`- [file] ${c.key} (${contentLen} chars)`);
        } else if (c.type === 'directory') {
            lines.push(`- [dir] ${c.key}`);
        } else if (c.type === 'tool') {
            lines.push(`- [tool] ${c.key} (payload: ${c.payload ? 'yes' : 'no'})`);
        }
    }
    lines.push('');
    return lines;
}

// ── Step Section (Plan) ───────────────────────────────────────────────────

export function buildStepSection(state: AceAgentV3State): string[] {
    const steps = state.steps ?? [];
    if (steps.length === 0) return [];

    const active = steps.find(s => s.status === 'active');
    const pending = steps.filter(s => s.status === 'pending').length;
    const done = steps.filter(s => s.status === 'done').length;

    const lines: string[] = [
        '### Current Plan — Step Progress',
        `Progress: ${done} done · ${active ? '1 active' : '0 active'} · ${pending} pending`,
        '',
    ];

    for (const s of steps) {
        const marker = s.status === 'active' ? '▶' : s.status === 'done' ? '✓' : '○';
        lines.push(`  ${marker} [${s.status}] ${s.goal}`);
    }

    if (active) {
        lines.push(
            '',
            `▶ CURRENT STEP: "${active.goal}" — focus ALL actions on completing this step.`,
            'Do NOT move to the next step until this one is fully done.',
        );
    }

    lines.push('');
    return lines;
}

// ── First Cycle Prompt ────────────────────────────────────────────────────

export function buildFirstCyclePrompt(): string[] {
    return [
        '### First Cycle — No History',
        '- This is a fresh request. Analyze what the user wants.',
        '- Is it a simple greeting, a factual question, or a complex task?',
        '- CRITICAL: NEVER end on the first cycle. You must execute an action first.',
        '',
    ];
}

// ── Cycle History ─────────────────────────────────────────────────────────

export function buildCycleHistory(
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

// ── Last Cycle Highlight ──────────────────────────────────────────────────

export function buildLastCycleHighlight(cycles: AceAgentV3State['cycles']): string[] {
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

// ── Decision Rules ────────────────────────────────────────────────────────

export function buildDecisionRules(cycleNum: number, maxCycles: number): string[] {
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
        '**Action Rules:**',
        '- `action_step`: MAX 1 per cycle. Use when the task is COMPLEX and needs a plan.',
        '  If you use action_step, do NOT include other actions — plan first, then execute in later cycles.',
        '  The step plan guides ALL future cycles. Create steps for multi-phase tasks.',
        '  Example: complex task → first cycle: action_step (plan), then execute step by step.',
        '- `action_speak`: MAX 2 per cycle (intro + summary pattern).',
        '- `action_memory`: MAX 1 per cycle. Put ALL memory operations into ONE reason.',
        '- Each action type appears AT MOST ONCE per cycle (except action_speak: max 2).',
        '- Other actions (`action_tool`, `action_read_file`, `action_write_file`, `action_shell`, `action_mcp`):',
        '  One entry each as needed.',
        '',
        '**Action Selection Guide:**',
        '- Complex / multi-phase task with no plan yet → `action_step` (plan the approach first).',
        '- Simple greeting / small talk / factual answer → `action_speak`.',
        '- If the user shared personal info, batch `action_speak, action_memory`.',
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

// ── Memory Extraction Rules ───────────────────────────────────────────────

export function buildMemoryExtractionRules(): string[] {
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
        'Pattern: greeting → action_types: "action_speak, action_memory"  (reply + store ALL facts in one reason)',
        'Pattern: task → action_types: "action_tool, action_memory"  (execute + store ALL results in one reason)',
        '',
    ];
}

// ── Pre-fetch Expanded Data ───────────────────────────────────────────────

export async function preFetchExpandedData(
    cycles: AceAgentV3State['cycles'],
): Promise<ExpandedCycleMap> {
    const expandedData: ExpandedCycleMap = new Map();
    const recentStart = Math.max(0, (cycles ?? []).length - 3);
    for (let ci = recentStart; ci < (cycles ?? []).length; ci++) {
        const c = cycles![ci];
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
    return expandedData;
}
