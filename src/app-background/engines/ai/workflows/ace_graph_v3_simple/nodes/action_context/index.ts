/**
 * Action: Context — expand or collapse context items (file, directory, tool).
 *
 * One action_context node receives ONE reason (e.g., "Expand src/main.ts and
 * collapse /home/user/Downloads") and the LLM extracts ALL toggle operations
 * from it — supporting multiple context toggles in one go.
 *
 * Pattern: identical to action_memory but operates on state.contexts instead
 * of state.memories. Does NOT persist to LangGraph store — contexts live in
 * the graph state only (their content is on disk via context-storage).
 */

import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { Command, END, getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import { buildErrorRecoveryCommand } from '../recovery-error-helper';
import { writeActionOutput, writeActionResult } from '#/app-background/lib/utils/thread-storage';
import type { AceAgentV3State, ContextItem } from '../../types';

// ── Structured output — JSON string in XML tag ────────────────────────────

const ContextAction = z.object({
    operations: z
        .string()
        .describe(
            'JSON array of context toggle operations. Each operation: ' +
            '{"action":"toggle","key":"...","expand":true|false}. ' +
            'Output ONLY the JSON array — no extra text, no markdown fences. ' +
            'Example: [{"action":"toggle","key":"src/main.ts","expand":true}]. ' +
            'Empty if nothing to do: [].',
        ),
});

const ContextOperationsSchema = z.array(
    z.object({
        action: z.literal('toggle'),
        key: z.string().min(1),
        expand: z.boolean(),
    }),
);

// ── Prompt ────────────────────────────────────────────────────────────────

function contextPrompt(state: AceAgentV3State, actionReason: string): string {
    const ctx = state.contexts ?? [];

    return [
        'You are a context manager. Extract ALL context toggle operations from the given reason.',
        '',
        '### What To Toggle',
        `"${actionReason}"`,
        '',
        '### Current Contexts',
        ctx.length === 0
            ? '(empty — no contexts yet)'
            : ctx.map(c =>
                `- [${c.type}] ${c.key} (is_expanded=${c.is_expanded})`,
            ).join('\n'),
        '',
        '### Guidelines',
        '- Parse the reason carefully — extract EVERY context key the user wants to expand or collapse.',
        '- "expand" = set is_expanded=true (content will be injected into prompt).',
        '- "collapse" = set is_expanded=false (only pointer shown, no content injected).',
        '- If the reason says "expand src/main.ts" → action: "toggle", key: "src/main.ts", expand: true.',
        '- If the reason says "collapse /home/user/Downloads" → action: "toggle", key: "/home/user/Downloads", expand: false.',
        '- Only toggle items that currently exist in the context list above.',
        '- If nothing to toggle → output [].',
        '',
        '### Output Format',
        'Put the operations as a JSON array inside <operations>...</operations>.',
        'NO wrapping, NO markdown, NO extra text — just the XML tag with the JSON array.',
        '',
        'Examples:',
        'Reason: "Expand src/main.ts dan collapse Downloads"',
        '<operations>[{"action":"toggle","key":"src/main.ts","expand":true},{"action":"toggle","key":"/home/user/Downloads","expand":false}]</operations>',
        '',
        'Reason: "Collapse all contexts"',
        '<operations>[{"action":"toggle","key":"src/main.ts","expand":false},{"action":"toggle","key":"/home/user/Downloads","expand":false}]</operations>',
    ].join('\n');
}

// ── Helpers ────────────────────────────────────────────────────────────────

function applyContextOperations(
    contexts: ContextItem[],
    operations: Array<{ key: string; expand: boolean }>,
): { updated: ContextItem[]; changed: string[] } {
    const updated = contexts.map(c => {
        const op = operations.find(o => o.key === c.key);
        if (op) {
            return { ...c, is_expanded: op.expand };
        }
        return c;
    });
    const changed = operations.map(o => o.key);
    return { updated, changed };
}

// ── Node ───────────────────────────────────────────────────────────────────

export function createActionContext() {
    return async function actionContext(state: AceAgentV3State): Promise<Partial<AceAgentV3State> | Command> {
        try {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action_context', 'ace-v3', state).catch(() => {});

        if (threadUid && !KernelEngine.readMemory(`thread:active:${threadUid}`)) {
            return new Command({ goto: END });
        }

        const cycle = state.current_cycle;

        // Get the RUNNING action's reason — this tells us WHAT to toggle
        const runningAction = cycle?.actions?.find(a => a.status === 'running');
        const actionReason = runningAction?.target?.reason ?? '';

        // Step 1: Ask LLM to extract ALL context operations from the reason
        const { resolved } = await invokeLLM({
            runtime: getConfig() as never,
            structuredOutput: ContextAction,
            messages: [new SystemMessage(contextPrompt(state, actionReason))],
            nodeName: 'action_context',
            graphName: 'ace-v3',
            maxRetries: 0,
            timeout: 10000,
            streaming: false,
        });

        // Step 1b: Parse JSON string → validate with sub-schema
        let operations: z.infer<typeof ContextOperationsSchema> = [];
        const raw = resolved?.operations;
        if (raw && typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                const validated = ContextOperationsSchema.safeParse(parsed);
                if (validated.success) {
                    operations = validated.data;
                } else {
                    console.warn('[action_context] operations parse failed:', validated.error.message);
                }
            } catch {
                console.warn('[action_context] JSON.parse failed for operations:', raw.slice(0, 200));
            }
        }

        // Step 2: Apply all toggle operations
        const { updated: updatedContexts, changed } = applyContextOperations(
            state.contexts ?? [],
            operations,
        );

        // Write output & result pointers
        const cycleIndex = (state.cycles ?? []).length - 1;
        const runningActionIdx = cycle?.actions?.findIndex((a: any) => a.status === 'running') ?? 0;
        if (runningAction && threadUid) {
            runningAction.output = await writeActionOutput(threadUid, cycleIndex, runningActionIdx, { operations }).catch(() => '');
            runningAction.result = await writeActionResult(threadUid, cycleIndex, runningActionIdx, { changed }).catch(() => '');
        }

        const output: Partial<AceAgentV3State> = {
            contexts: updatedContexts,
            current_cycle: cycle,
            target_node: 'action_dispatcher',
            from_node: 'action_context',
        };

        if (threadUid)
            emitNodeEnd(threadUid, 'action_context', 'ace-v3', output, {
                operationCount: operations.length,
                changedKeys: changed,
            }).catch(() => {});

        return output;
        } catch (error) {
            console.error('[action_context] Error:', error);
            return buildErrorRecoveryCommand(error, 'action_context');
        }
    };
}
