/**
 * Action: Step — manage the step plan from a single reason.
 *
 * One action_step node receives ONE reason (e.g., "Breakdown task into 3 steps:
 * Understand, Execute, Report") and the LLM extracts ALL step operations from it —
 * supporting create/update/delete of plan steps in one go.
 *
 * Parallel to action_memory — same JSON-in-XML pattern:
 *   - Schema: operations is a z.string() (JSON array inside XML tag)
 *   - Node: JSON.parse → Zod validate → apply to state.steps
 */

import { SystemMessage } from '@langchain/core/messages';
import { Command, END, getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import { buildErrorRecoveryCommand } from '../recovery-error-helper';
import { writeActionOutput, writeActionResult } from '#/app-background/lib/utils/thread-storage';
import type { AceAgentV3State, ActionStepItem } from '../../types';

// ── Structured output — JSON string in XML tag ────────────────────────────

const StepAction = z.object({
    operations: z
        .string()
        .describe(
            'JSON array of step operations. Each operation: ' +
            '{"action":"create|update|delete","id":"..."?,"goal":"..."?,"status":"pending|active|done"?}. ' +
            'Output ONLY the JSON array inside <operations>...</operations> — no extra text. ' +
            'Example: [{"action":"create","goal":"Read config file","status":"pending"}]. ' +
            'Empty if nothing to plan: [].',
        ),
});

/** Sub-schema for validating the parsed JSON array. */
const StepOperationsSchema = z.array(
    z.object({
        action: z.enum(['create', 'update', 'delete']),
        id: z.string().optional().describe('Required for update/delete. Auto-generated for create.'),
        goal: z.string().optional().describe('Step description. Required for create/update.'),
        status: z.enum(['pending', 'active', 'done']).optional().describe('Default: pending.'),
    }),
);

// ── Prompt ────────────────────────────────────────────────────────────────

function stepPrompt(state: AceAgentV3State, actionReason: string): string {
    const steps = state.steps ?? [];

    return [
        'You are a task planner. Create or update a step-by-step plan from the given reason.',
        '',
        '### What To Plan',
        `"${actionReason}"`,
        '',
        '### Current Steps',
        steps.length === 0
            ? '(no steps yet)'
            : steps.map(s =>
                `- [${s.id}] (${s.status}) "${s.goal}"`,
            ).join('\n'),
        '',
        '### Guidelines',
        '- Break the task into sequential, dependent steps (Step 1 must finish before Step 2).',
        '- Each step is a MILESTONE that may require multiple cycles to complete.',
        '- Use "create" to add new steps (id is auto-generated, omit it).',
        '- Use "update" to change an existing step\'s goal or status by its id.',
        '- Use "delete" to remove a step by its id.',
        '- Steps should be ordered: first step → status "active", rest → status "pending".',
        '- Max 5 steps. If task is simple, use 1-2 steps.',
        '',
        '### Output Format',
        'Put the operations as a JSON array inside <operations>...</operations>.',
        'NO wrapping, NO markdown, NO extra text — just the XML tag with the JSON array.',
        '',
        'Examples:',
        'Plan: "Breakdown: read config, analyze data, report results"',
        '<operations>[{"action":"create","goal":"Read and parse config file","status":"active"},{"action":"create","goal":"Analyze the data","status":"pending"},{"action":"create","goal":"Report results to user","status":"pending"}]</operations>',
        '',
        'Plan: "Mark step abc123 as done, activate step def456"',
        '<operations>[{"action":"update","id":"abc123","status":"done"},{"action":"update","id":"def456","status":"active"}]</operations>',
    ].join('\n');
}

// ── Helpers ────────────────────────────────────────────────────────────────

function generateStepId(): string {
    return `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function applyStepOperations(
    steps: ActionStepItem[],
    operations: Array<{ action: string; id?: string; goal?: string; status?: string }>,
): ActionStepItem[] {
    let list = [...steps];

    for (const op of operations) {
        switch (op.action) {
            case 'create': {
                const item: ActionStepItem = {
                    id: generateStepId(),
                    goal: op.goal ?? 'Untitled step',
                    status: (op.status as ActionStepItem['status']) ?? 'pending',
                };
                list.push(item);
                break;
            }
            case 'update': {
                const target = list.find(s => s.id === op.id);
                if (target) {
                    if (op.goal !== undefined) target.goal = op.goal;
                    if (op.status) target.status = op.status as ActionStepItem['status'];
                }
                break;
            }
            case 'delete': {
                list = list.filter(s => s.id !== op.id);
                break;
            }
        }
    }

    return list;
}

// ── Node ───────────────────────────────────────────────────────────────────

export function createActionStep() {
    return async function actionStep(state: AceAgentV3State): Promise<Partial<AceAgentV3State> | Command> {
        try {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action_step', 'ace-v3', state).catch(() => {});

        if (threadUid && !KernelEngine.readMemory(`thread:active:${threadUid}`)) {
            return new Command({ goto: END });
        }

        const cycle = state.current_cycle;

        // Get the RUNNING action's reason — this tells us WHAT to plan
        const runningAction = cycle?.actions?.find(a => a.status === 'running');
        const actionReason = runningAction?.target?.reason ?? '';

        // Step 1: Ask LLM to extract ALL step operations from the reason
        const { resolved } = await invokeLLM({
            runtime: getConfig() as never,
            structuredOutput: StepAction,
            messages: [new SystemMessage(stepPrompt(state, actionReason))],
            nodeName: 'action_step',
            graphName: 'ace-v3',
            maxRetries: 0,
            timeout: 10000,
            streaming: false,
        });

        // Step 1b: Parse JSON string → validate with sub-schema
        let operations: z.infer<typeof StepOperationsSchema> = [];
        const raw = resolved?.operations;
        if (raw && typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                const validated = StepOperationsSchema.safeParse(parsed);
                if (validated.success) {
                    operations = validated.data;
                } else {
                    console.warn('[action_step] operations parse failed:', validated.error.message);
                }
            } catch {
                console.warn('[action_step] JSON.parse failed for operations:', raw.slice(0, 200));
            }
        }

        // Step 2: Apply all operations
        const updatedSteps = applyStepOperations(state.steps ?? [], operations);

        // Write output & result pointers
        const cycleIndex = (state.cycles ?? []).length - 1;
        const runningActionIdx = cycle?.actions?.findIndex((a: any) => a.status === 'running') ?? 0;
        if (runningAction && threadUid) {
            runningAction.output = await writeActionOutput(threadUid, cycleIndex, runningActionIdx, { operations }).catch(() => '');
            runningAction.result = await writeActionResult(threadUid, cycleIndex, runningActionIdx, { stepCount: updatedSteps.length }).catch(() => '');
        }

        const output: Partial<AceAgentV3State> = {
            steps: updatedSteps,
            current_cycle: cycle,
            target_node: 'action_dispatcher',
            from_node: 'action_step',
        };

        if (threadUid)
            emitNodeEnd(threadUid, 'action_step', 'ace-v3', output, {
                operationCount: operations.length,
                stepCount: updatedSteps.length,
            }).catch(() => {});

        return output;
        } catch (error) {
            console.error('[action_step] Error:', error);
            return buildErrorRecoveryCommand(error, 'action_step');
        }
    };
}
