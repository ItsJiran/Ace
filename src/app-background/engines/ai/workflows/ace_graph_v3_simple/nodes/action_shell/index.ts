/**
 * Action: Shell — execute batched shell commands with LLM-driven needs_rethought.
 *
 * One action_shell node receives ONE reason (e.g., "Move files from Downloads
 * to Backup") and the LLM extracts ALL shell commands from it — supporting
 * multiple commands in one go (like action_memory pattern).
 *
 * The LLM also decides whether prerequisites are met (needs_rethought):
 *   - false → output commands, execute them
 *   - true  → output rethought_reason explaining what's missing
 *             → dispatcher routes to thought for re-assessment
 */

import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { Command, END, getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import { execSync } from 'node:child_process';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import { emitNodeStart, emitNodeEnd, emitNodeProgress, emitNodeProgressDone } from '#/app-background/lib/utils/ai/emit-graph-event';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import { buildErrorRecoveryCommand } from '../recovery-error-helper';
import { writeActionOutput, writeActionResult } from '#/app-background/lib/utils/thread-storage';
import { createContextTool, writeContextTool } from '#/app-background/lib/utils/context-storage';
import {
    buildContextSection,
    buildStepSection,
    buildCycleHistory,
    buildLastCycleHighlight,
    preFetchExpandedData,
} from '#/app-background/lib/utils/ai/prompt-builders';
import type { AceAgentV3State } from '../../types';

// ── Structured output — JSON string in XML tag ────────────────────────────

const ShellAction = z.object({
    operations: z
        .string()
        .describe(
            'JSON array of shell command operations. Each: ' +
            '{"cmd":"<command>","reason":"<why this command>"}. ' +
            'Output ONLY inside <operations>...</operations>. ' +
            'Empty if nothing to execute: [].',
        ),
    needs_rethought: z
        .boolean()
        .describe(
            'Set true if prerequisites are NOT met. For example: ' +
            'directory context missing for file ops, step plan not followed. ' +
            'Set false if all prerequisites are met and commands can execute.',
        ),
    rethought_reason: z
        .string()
        .optional()
        .describe(
            'Required if needs_rethought=true. Explain what is missing and what ' +
            'should be done first. Be specific — reference the missing context/step.',
        ),
});

const ShellOperationsSchema = z.array(
    z.object({
        cmd: z.string().min(1),
        reason: z.string().min(1),
    }),
);

// ── Prompt ────────────────────────────────────────────────────────────────

async function shellPrompt(
    state: AceAgentV3State,
    actionReason: string,
    cycles: AceAgentV3State['cycles'],
): Promise<string> {
    const [contextSection] = await Promise.all([buildContextSection(state)]);

    const sections: string[][] = [
        [
            'You are a shell command generator. Extract ALL commands from the given reason.',
            '',
            '### What To Execute',
            `"${actionReason}"`,
            '',
            '### Step Plan',
            ...buildStepSection(state),
            '',
            ...contextSection,
            '',
            '### Prerequisite Check — needs_rethought',
            'Before generating commands, check if ALL prerequisites are met:',
            '  1. For FILE/DIRECTORY operations (mv, cp, rm, cat, mkdir, etc.):',
            '     The SOURCE directory or file MUST be listed in Active Contexts above.',
            '     If not → needs_rethought=true.',
            '  2. For universal commands (node --version, echo, date, npm --version):',
            '     No context needed → needs_rethought=false.',
            '  3. Is the current step plan being followed?',
            '  4. Are there missing dependencies (npm/pip packages)?',
            '',
            'If ANY prerequisite missing → needs_rethought=true + rethought_reason.',
            'If ALL prerequisites met → needs_rethought=false + output commands.',
            '',
            '### Guidelines for Commands',
            '- Generate safe one-liner commands. Chain with && if needed. Max 5 per batch.',
            '- Use absolute paths when possible.',
            '- NEVER use rm -rf without explicit user confirmation.',
            '- For directory listing: prefer action_list_directory (not ls).',
            '- For simple computation: prefer action_tool (not bc/python).',
            '',
            '### Output Format',
            '<operations>[...]</operations>',
            '<needs_rethought>true|false</needs_rethought>',
            '<rethought_reason>explanation if true</rethought_reason>',
            '',
            '### Examples',
            '',
            'Ex 1 — Context has dir → can execute:',
            'Reason: "Move all txt files from Downloads to Backup"',
            'Context: --- DIRECTORY: /home/user/Downloads --- (expanded)',
            '<operations>[{"cmd":"mv /home/user/Downloads/*.txt /home/user/Backup/","reason":"Move text files to backup"}]</operations>',
            '<needs_rethought>false</needs_rethought>',
            '',
            'Ex 2 — Context missing → needs_rethought:',
            'Reason: "Move all txt files from Downloads to Backup"',
            'Context: (no directory contexts)',
            '<operations>[]</operations>',
            '<needs_rethought>true</needs_rethought>',
            '<rethought_reason>Cannot move files from /home/user/Downloads — directory not in context. Need to run action_list_directory on /home/user/Downloads first to know what files exist before moving.</rethought_reason>',
            '',
            'Ex 3 — Universal command, no context needed:',
            'Reason: "Check node version and npm version"',
            '<operations>[{"cmd":"node --version","reason":"Check Node.js version"},{"cmd":"npm --version","reason":"Check npm version"}]</operations>',
            '<needs_rethought>false</needs_rethought>',
            '',
            'Ex 4 — Batched with context:',
            'Reason: "Install deps and build project"',
            'Context: --- DIRECTORY: /home/user/project --- (expanded)',
            '<operations>[{"cmd":"cd /home/user/project && npm install","reason":"Install dependencies"},{"cmd":"cd /home/user/project && npm run build","reason":"Build project"}]</operations>',
            '<needs_rethought>false</needs_rethought>',
        ],
    ];

    if ((cycles ?? []).length > 0) {
        const expandedData = await preFetchExpandedData(cycles);
        sections.push([
            ...buildCycleHistory(cycles, expandedData),
            ...buildLastCycleHighlight(cycles),
        ]);
    }

    return sections.flat().filter(Boolean).join('\n');
}

// ── Helpers ────────────────────────────────────────────────────────────────

// (shell commands executed inline with progress emitting)

// ── Node ───────────────────────────────────────────────────────────────────

export function createActionShell() {
    return async function actionShell(
        state: AceAgentV3State,
    ): Promise<Partial<AceAgentV3State> | Command> {
        try {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action_shell', 'ace-v3', state).catch(() => {});

        if (threadUid && !KernelEngine.readMemory(`thread:active:${threadUid}`)) {
            return new Command({ goto: END });
        }

        const cycle = state.current_cycle;
        const cycles = state.cycles ?? [];
        const runningAction = cycle?.actions?.find(a => a.status === 'running');
        const actionReason = runningAction?.target?.reason ?? '';

        // Step 1: Ask LLM to extract commands AND check prerequisites
        const { resolved } = await invokeLLM({
            runtime: getConfig() as never,
            structuredOutput: ShellAction,
            messages: [new SystemMessage(await shellPrompt(state, actionReason, cycles))],
            nodeName: 'action_shell',
            graphName: 'ace-v3',
            maxRetries: 0,
            timeout: 15000,
            streaming: false,
        });

        // Step 2: Parse operations and check needs_rethought
        const needsRethought = resolved?.needs_rethought ?? false;
        const rethoughtReason = resolved?.rethought_reason ?? '';
        let operations: z.infer<typeof ShellOperationsSchema> = [];

        const rawOps = resolved?.operations;
        if (rawOps && typeof rawOps === 'string') {
            try {
                const parsed = JSON.parse(rawOps);
                const validated = ShellOperationsSchema.safeParse(parsed);
                if (validated.success) {
                    operations = validated.data;
                }
            } catch { /* fallback */ }
        }

        const cycleIndex = (state.cycles ?? []).length - 1;
        const runningActionIdx = cycle?.actions?.findIndex((a: any) => a.status === 'running') ?? 0;

        // Step 3: needs_rethought or empty operations → signal dispatcher
        if (needsRethought || operations.length === 0) {
            const reason = rethoughtReason || 'No actionable shell commands from the reason.';
            if (runningAction && threadUid) {
                runningAction.status = 'needs_rethought';
                runningAction.output = await writeActionOutput(threadUid, cycleIndex, runningActionIdx, {
                    needs_rethought: true,
                    reason,
                    operations,
                }).catch(() => '');
            }

            const output: Partial<AceAgentV3State> = {
                current_cycle: cycle,
                target_node: 'action_dispatcher',
                from_node: 'action_shell',
            };

            if (threadUid)
                emitNodeEnd(threadUid, 'action_shell', 'ace-v3', output, { needsRethought: true }).catch(() => {});

            return output;
        }

        // Step 4: Execute commands with progress emitting
        const results: Array<{ cmd: string; reason: string; success: boolean; stdout: string; stderr: string }> = [];
        const progressUid = `shell-${Date.now()}`;

        const buildProgressXml = () => {
            const parts: string[] = [];
            for (const r of results) {
                parts.push(
                    `  <cmd status="${r.success ? 'ok' : 'fail'}" command="${r.cmd.slice(0, 80)}">` +
                    `${r.success ? r.stdout.slice(0, 120) : r.stderr.slice(0, 120)}` +
                    `</cmd>`,
                );
            }
            for (const op of operations) {
                if (!results.some(r => r.cmd === op.cmd)) {
                    parts.push(`  <cmd status="pending" command="${op.cmd.slice(0, 80)}" />`);
                }
            }
            return parts.length > 0 ? `<shell>\n${parts.join('\n')}\n</shell>` : '';
        };

        if (threadUid && operations.length > 0) {
            emitNodeProgress(threadUid, 'action_shell', 'ace-v3', progressUid, buildProgressXml()).catch(() => {});
        }

        for (const op of operations) {
            try {
                const stdout = execSync(op.cmd, {
                    encoding: 'utf-8',
                    timeout: 30000,
                    maxBuffer: 1024 * 1024,
                }).trim();
                results.push({ cmd: op.cmd, reason: op.reason, success: true, stdout: stdout.slice(0, 2000), stderr: '' });
            } catch (err: any) {
                results.push({
                    cmd: op.cmd,
                    reason: op.reason,
                    success: false,
                    stdout: err.stdout?.toString().slice(0, 1000) ?? '',
                    stderr: err.stderr?.toString().slice(0, 1000) ?? err.message?.slice(0, 1000) ?? 'unknown error',
                });
            }

            if (threadUid) {
                emitNodeProgress(threadUid, 'action_shell', 'ace-v3', progressUid, buildProgressXml()).catch(() => {});
            }
        }

        // Emit final progress then clear ephemeral
        if (threadUid && operations.length > 0) {
            emitNodeProgress(threadUid, 'action_shell', 'ace-v3', progressUid, buildProgressXml()).catch(() => {});
            emitNodeProgressDone(threadUid, 'action_shell', 'ace-v3', progressUid).catch(() => {});
        }

        const successCount = results.filter(r => r.success).length;
        const failCount = results.length - successCount;

        const resultText = results
            .map(r => `${r.success ? '✅' : '❌'} ${r.cmd.slice(0, 80)}: ${r.success ? r.stdout.slice(0, 100) : r.stderr.slice(0, 100)}`)
            .join('\n');
        const summary = `${successCount}/${results.length} commands succeeded.${failCount > 0 ? ` ${failCount} failed.` : ''}`;

        // Write output & result pointers
        if (runningAction && threadUid) {
            runningAction.output = await writeActionOutput(threadUid, cycleIndex, runningActionIdx, {
                operations,
                summary,
            }).catch(() => '');
            runningAction.result = await writeActionResult(threadUid, cycleIndex, runningActionIdx, {
                results,
                summary,
            }).catch(() => '');
        }

        // Persist as tool context
        let toolContext = createContextTool(
            `shell-${runningActionIdx}-${Date.now()}`,
            `Shell: ${summary}`,
        );
        if (threadUid) {
            toolContext = await writeContextTool(threadUid, toolContext, {
                payload: { operations },
                result: { results, summary },
            });
        }
        const updatedContexts = [...(state.contexts ?? []), toolContext];

        // Build final XML for AIMessage
        const finalXml = buildProgressXml();

        const output: Partial<AceAgentV3State> = {
            messages: [new AIMessage({ content: finalXml, name: 'ace-v3-shell' })],
            contexts: updatedContexts,
            current_cycle: cycle,
            target_node: 'action_dispatcher',
            from_node: 'action_shell',
        };

        if (threadUid)
            emitNodeEnd(threadUid, 'action_shell', 'ace-v3', output, {
                successCount,
                failCount,
            }).catch(() => {});

        return output;
        } catch (error) {
            console.error('[action_shell] Error:', error);
            return buildErrorRecoveryCommand(error, 'action_shell');
        }
    };
}
