/**
 * Shared Prompt Builders — reusable prompt fragments for all agent nodes.
 *
 * Extracted from thought/index.ts so action_speak, action_memory, etc.
 * can all use the same cycle history, memory, and context formatting.
 */

import type { AceAgentV3State } from '#/app-background/engines/ai/workflows/ace_graph_v3_simple/types';
import { readActionOutput, readActionResult } from '#/app-background/lib/utils/thread-storage';
import { readContextContent } from '#/app-background/lib/utils/context-storage';

// ── Expanded data types for inline output/result ──────────────────────────

export interface ExpandedActionData {
    output?: string;
    result?: string;
}

export type ExpandedCycleMap = Map<number, Map<number, ExpandedActionData>>;

// ── System Intro ──────────────────────────────────────────────────────────

export function buildSystemIntro(state: AceAgentV3State): string[] {
    const showRequest = state.is_prompt_state === 'new';
    const base = [
        'You are an AI agent. Observe the current state, then decide the next action.',
        '',
    ];

    if (showRequest) {
        base.push('### User Request', `"${state.original_prompt}"`, '');
    } else {
        base.push(
            '### Context',
            '(The original user request is no longer shown — rely on cycle history,',
            'memories, and current plan to understand what remains to be done.)',
            '',
        );
    }

    return base;
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

export async function buildContextSection(state: AceAgentV3State): Promise<string[]> {
    const ctx = state.contexts ?? [];
    if (ctx.length === 0) return [];

    const expanded = ctx.filter(c => c.is_expanded);
    const collapsed = ctx.filter(c => !c.is_expanded);

    const lines: string[] = [
        '### Active Contexts',
        '',
        'Contexts store files, directories, and tool results the agent has gathered.',
        'Each context item can be toggled via action_context:',
        '  - collapsed (is_expanded=false): item is listed but its content is NOT injected into the prompt.',
        '  - expanded  (is_expanded=true):  item is listed AND its full content is injected below.',
        'Use action_context (not action_read_file / action_list_directory / action_memory) to toggle.',
        '',
        `Summary: ${expanded.length} expanded · ${collapsed.length} collapsed · ${ctx.length} total`,
        '',
    ];

    for (const c of ctx) {
        if (c.type === 'file') {
            lines.push(`\n--- FILE: ${c.key} ---`);
            lines.push(`summary: ${c.summary}`);
            lines.push(`status: ${c.is_expanded ? 'expanded' : 'collapsed'}`);
            if (c.is_expanded && c.content) {
                const raw = await readContextContent(c.content);
                if (raw !== null) {
                    lines.push('```');
                    lines.push(raw);
                    lines.push('```');
                } else {
                    lines.push('(content file not found on disk)');
                }
            } else {
                lines.push(`pointer: ${c.content}`);
            }
        } else if (c.type === 'directory') {
            lines.push(`\n--- DIRECTORY: ${c.key} ---`);
            lines.push(`summary: ${c.summary}`);
            lines.push(`status: ${c.is_expanded ? 'expanded' : 'collapsed'}`);
            if (c.is_expanded && c.content) {
                const raw = await readContextContent(c.content);
                if (raw !== null) {
                    lines.push('```json');
                    lines.push(raw);
                    lines.push('```');
                } else {
                    lines.push('(content file not found on disk)');
                }
            } else {
                lines.push(`pointer: ${c.content}`);
            }
        } else if (c.type === 'tool') {
            lines.push(`\n--- TOOL: ${c.key} ---`);
            lines.push(`summary: ${c.summary}`);
            lines.push(`status: ${c.is_expanded ? 'expanded' : 'collapsed'}`);
            if (c.is_expanded && c.output) {
                const raw = await readContextContent(c.output);
                if (raw !== null) {
                    lines.push('```json');
                    lines.push(raw);
                    lines.push('```');
                } else {
                    lines.push('(output file not found on disk)');
                }
            } else {
                lines.push(`payload: ${c.payload ?? 'none'} | output: ${c.output ?? 'none'}`);
            }
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
        '**Anti-Looping Rules — CRITICAL:**',
        '- ⚠️  NEVER repeat the exact same action with the same target for the same reason.',
        '  Example: if Thought (2) ran action_tool and got "under development",',
        '  do NOT run action_tool again in Thought (3). Try action_speak or action_shell instead.',
        '- ⚠️  Before choosing actions, scan the last 3 cycles. If any action appears TWICE',
        '  with the same target and similar reason, you are LOOPING. Choose something NEW.',
        '- ⚠️  If a cycle\'s result_summary or output says "under development", "pending",',
        '  "not available", or "failed" — consider it a permanent result. Do NOT retry.',
        '- If you are stuck and all actions have failed, use action_speak to explain to the user',
        '  what was attempted and ask for guidance. Then use `end`.',
        '',
        '**Action Rules:**',
        '- ⚠️  `action_step`: Use ONLY when the task is COMPLEX and NO plan exists yet.',
        '  When you choose action_step, it MUST be the ONLY action in this cycle — NO other actions.',
        '  The step plan then guides ALL future cycles. Execute step by step in later cycles.',
        '  DO NOT use action_step if: (a) steps already exist, (b) task is simple, (c) user just wants a greeting or factual answer.',
        '  Example: complex task with no plan → action_step ONLY (plan), next cycle → execute actions.',
        '  Example: task WITH existing plan → skip action_step, execute actions directly.',
        '- `action_speak`: MAX 2 per cycle (intro + summary pattern).',
        '- `action_memory`: MAX 1 per cycle. Put ALL memory operations into ONE reason.',
        '- `action_context`: MAX 1 per cycle. Put ALL context toggle operations into ONE reason.',
        '- Each action type appears AT MOST ONCE per cycle (except action_speak: max 2).',
        '- Other actions (`action_tool`, `action_read_file`, `action_write_file`, `action_shell`, `action_mcp`, `action_context`):',
        '  One entry each as needed.',
        '',
        '**Action Selection Guide — WRONG → RIGHT:**',
        '── User-perspective:',
        '- User asks "list files in src/"       → ❌ action_shell  ✅ action_list_directory',
        '- User asks "read config.yaml"        → ❌ action_shell  ✅ action_read_file',
        '- User asks "run npm install"         → ❌ action_tool   ✅ action_shell',
        '- User asks "what is 2+2"             → ❌ action_tool   ✅ action_speak',
        '- User asks "create file x.txt"       → ❌ action_shell  ✅ action_write_file',
        '── Agent-perspective (your internal decisions):',
        '- Agent wants to explore a folder      → ❌ action_read_file  ✅ action_list_directory',
        '- Agent lists dir: USE EXACT path from plan — do NOT simplify "src/components" to "src"',
        '- Agent reads file: USE EXACT path from plan — "src/index.ts" not just "index.ts"',
        '- Agent wants to check file contents   → ❌ action_shell      ✅ action_read_file',
        '- Agent needs to run a CLI command     → ❌ action_tool       ✅ action_shell',
        '- Agent needs to do math/computation   → ❌ action_shell      ✅ action_tool',
        '- Agent wants to save user info        → ❌ action_write_file ✅ action_memory',
        '- Agent needs structured plan/breakdown→ ❌ action_speak      ✅ action_step',
        '',
        '- Complex / multi-phase task with no plan yet → `action_step` (plan the approach first).',
        '',
        '### When To Use `action_step` — TRIGGER CONDITIONS',
        '',
        'action_step is ONLY triggered when ALL of the following are true:',
        '  1. The task is COMPLEX — it requires multiple distinct phases to complete.',
        '  2. There is NO existing plan (state.steps is empty or all steps are done).',
        '  3. You cannot complete the request in a single cycle — multiple cycles are needed.',
        '',
        'Examples of WHEN to trigger action_step:',
        '  ✅ "Organize my Downloads folder: move images to Pictures, docs to Documents, clean up duplicates"',
        '     → Multiple phases: explore Downloads → categorize → move files → clean up → report',
        '  ✅ "Help me research a topic: find info about MCP servers, summarize, and save notes"',
        '     → Multiple phases: search/explore → read → summarize → save → report',
        '  ✅ "Check my system: see disk usage, running processes, and installed packages"',
        '     → Multiple phases: disk check → process check → package list → summarize',
        '  ✅ "Set up my workspace: create folders, download config file, set environment variables"',
        '     → Multiple phases: create dirs → fetch config → set env → verify',
        '  ✅ "Compare two files and tell me the differences"',
        '     → Not complex enough for action_step — use action_read_file (x2) + action_speak',
        '',
        'Examples of when NOT to trigger action_step:',
        '  ❌ "Hello" → use action_speak (simple greeting)',
        '  ❌ "What is 2+2?" → use action_tool + action_speak (single computation)',
        '  ❌ "Show me what\'s in this folder" → use action_list_directory + action_speak',
        '  ❌ "What does this file say?" → use action_read_file + action_speak',
        '  ❌ "Create a file notes.txt with my notes" → use action_write_file + action_speak',
        '  ❌ "Run npm install here" → use action_shell + action_speak',
        '  ❌ "Remember my name is Alex" → use action_speak + action_memory',
        '  ❌ Task where plan already exists → SKIP action_step, execute directly',
        '',
        'When you DO trigger action_step:',
        '  - action_step MUST be the ONLY action in that cycle.',
        '  - Do NOT add action_speak, action_memory, or ANY other action alongside it.',
        '  - The next cycle should start executing the plan steps.',
        '',
        '- Simple greeting / small talk / factual answer → `action_speak`.',
        '- If the user shared personal info, batch `action_speak, action_memory`.',
        '- Need to execute code or commands → `action_tool`.',
        '- Need to manage or recall memories → `action_memory`.',
        '- Need to expand/collapse context items → `action_context`.',
        '- Need to read a file → `action_read_file`.',
        '- Need to list directory contents → `action_list_directory`.',
        '- Need to write/create a file → `action_write_file`.',
        '- Need to run shell commands (npm, pip, git, etc.) → `action_shell`.',
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
