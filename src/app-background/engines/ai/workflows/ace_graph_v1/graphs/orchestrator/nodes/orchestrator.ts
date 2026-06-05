import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import mainModel from '../../../../../models/main_model';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentOrchestratorState, AceAgentOrchestratorTask } from '../types';

// ── Structured output schema ───────────────────────────────────────────────

/**
 * Schema for the orchestrator node's planning output.
 *
 * The orchestrator creates a task list for the subgraph nodes:
 * `planner` → `contextor` → `thought` → `orchestrator` → (loop or __end__).
 */
const OrchestratorPlanSchema = z.object({
    tasks: z
        .array(
            z.object({
                type: z
                    .enum(['planner', 'contextor', 'orchestrator', '__end__'])
                    .describe('The orchestrator subgraph node to route to.'),
                summary: z
                    .string()
                    .describe('One sentence describing what this task should accomplish.'),
                payload: z
                    .record(z.string(), z.any())
                    .optional()
                    .describe('Extra context for the node (e.g. tool hints, domain constraints).'),
            }),
        )
        .describe('Ordered list of tasks to execute in the orchestrator subgraph.'),
    plan_rationale: z
        .string()
        .describe('Brief explanation of why this sequence was chosen.'),
});

type OrchestratorPlanOutput = z.infer<typeof OrchestratorPlanSchema>;

// ── System prompt ───────────────────────────────────────────────────────────

function buildOrchestratorSystemPrompt(state: AceAgentOrchestratorState): string {
    const hasTarget = !!(state.target_node && state.target_node_reason);

    const nodeDescriptions = [
        '### Orchestrator Subgraph Nodes',
        '',
        '| Node | Purpose | Required? |',
        '|------|---------|-----------|',
        '| `planner` | Break down the high-level intent into concrete, ordered action steps for the parent graph. | Always first |',
        '| `contextor` | Gather relevant context (files, tool schemas, existing info) from the workspace. | Optional — only if context is missing or outdated |',
        '| `orchestrator` | Supervise — review progress, adjust tasks, or signal completion (`__end__`). | Always last before loop/end |',
        '',
        '**Expected flow**: planner → (contextor?) → orchestrator → __end__',
        '',
        'When to include `contextor`:',
        '- The original prompt references files, tools, or project structure that you do not yet see in the existing messages.',
        '- Do NOT include `contextor` if sufficient context is already present — skip directly to `orchestrator`.',
    ].join('\n');

    const planningRules = [
        '### Planning Rules',
        '',
        '1. Start with `planner` — it creates the action plan for the parent graph.',
        '2. `contextor` is OPTIONAL — only include when context is genuinely needed.',
        '3. End the task list with `orchestrator` (for review) then `__end__`.',
        '4. Each task must have a clear, actionable `summary` — one sentence.',
        '5. Use `payload` sparingly — only for node-specific hints (e.g. tool names for contextor).',
        hasTarget
            ? '6. The plan MUST revolve around the target_node described below.'
            : '6. Derive the plan from original_prompt and passed_message.',
    ].join('\n');

    const exampleOutput = [
        '### Example Output',
        '',
        '**Scenario**: User asks "refactor the auth module to use JWT". No context yet.',
        '',
        '```json',
        '{',
        '  "tasks": [',
        '    { "type": "planner", "summary": "Plan: 1) Find auth files 2) Replace session logic with JWT 3) Update middleware" },',
        '    { "type": "contextor", "summary": "Retrieve auth module files and current session implementation" },',
        '    { "type": "orchestrator", "summary": "Review gathered context and plan — ready for executor" },',
        '    { "type": "__end__", "summary": "Orchestrator plan complete — hand off to parent" }',
        '  ],',
        '  "plan_rationale": "No auth context available, so included contextor. planner→contextor→orchestrator→end is the natural flow."',
        '}',
        '```',
        '',
        '**Scenario**: User asks "what does this project do?". Messages already contain file tree and README.',
        '',
        '```json',
        '{',
        '  "tasks": [',
        '    { "type": "planner", "summary": "Plan: summarise project purpose based on available context" },',
        '    { "type": "orchestrator", "summary": "Review summary — ready to conclude" },',
        '    { "type": "__end__", "summary": "Summary complete — no further context needed" }',
        '  ],',
        '  "plan_rationale": "Context already available — skipped contextor. planner→orchestrator→end is sufficient."',
        '}',
        '```',
    ].join('\n');

    const targetSection = hasTarget
        ? [
              '',
              '### Target Node Guidance',
              `The parent graph requested: **${state.target_node}**`,
              `Reason: "${state.target_node_reason}"`,
              'Build the task plan so it addresses this specific target.',
          ].join('\n')
        : '';

    return [nodeDescriptions, planningRules, exampleOutput, targetSection].join('\n\n');
}

function buildOrchestratorContextPrompt(state: AceAgentOrchestratorState): string {
    const parts: string[] = [];

    parts.push(`**Original user prompt** (for context): "${state.original_prompt}"`);

    if (state.passed_message) {
        parts.push(`**Passed instruction from parent**: "${state.passed_message}"`);
    }

    if (state.parent?.tasks?.length) {
        parts.push(
            `**Parent tasks**: ${state.parent.tasks.map((t) => `[${t.type}] ${t.summary}`).join(', ')}`,
        );
    }

    const existingTasks = state.tasks ?? [];
    if (existingTasks.length > 0) {
        parts.push(
            `**Existing tasks** (adjust as needed):\n${existingTasks.map((t) => `- [${t.type}:${t.status}] ${t.summary}`).join('\n')}`,
        );
    }

    parts.push(
        'Based on the context above, generate an ordered task plan for the orchestrator subgraph.',
    );

    return parts.join('\n\n');
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toOrchestratorTasks(plan: OrchestratorPlanOutput): AceAgentOrchestratorTask[] {
    return plan.tasks.map((t, i) => ({
        id: `orch-task-${Date.now()}-${i}`,
        type: t.type,
        summary: t.summary,
        payload: t.payload ?? {},
        status: 'pending' as const,
    }));
}

// ── Node factory ────────────────────────────────────────────────────────────

/**
 * Orchestrator node — creates the initial task plan for the orchestrator
 * subgraph. If a `target_node` + `target_node_reason` were passed from the
 * parent, the plan revolves around that target. After planning, the target
 * is cleared so subsequent loops don't re-use stale routing intent.
 */
export function createOrchestratorNode() {
    return async function orchestratorNode(
        state: AceAgentOrchestratorState,
    ): Promise<Partial<AceAgentOrchestratorState>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'orchestrator', 'orchestrator', state).catch(() => {});

        const model = await mainModel({
            runtime: config as never,
            structuredOutput: OrchestratorPlanSchema,
        });

        const systemMsg = new SystemMessage(buildOrchestratorSystemPrompt(state));
        const contextMsg = new AIMessage(buildOrchestratorContextPrompt(state));

        const plan: OrchestratorPlanOutput = await model.invoke([
            systemMsg,
            ...(state.messages ?? []),
            contextMsg,
        ]);

        const tasks = toOrchestratorTasks(plan);

        const result = {
            messages: [
                ...(state.messages ?? []),
                new AIMessage({
                    content: `Orchestrator plan: ${plan.plan_rationale}`,
                    name: 'orchestrator-orchestrator',
                }),
            ],
            tasks,
            result_summary: plan.plan_rationale,
            target_node: undefined,
            target_node_reason: undefined,
            passed_message: '',
        };

        if (threadUid) emitNodeEnd(threadUid, 'orchestrator', 'orchestrator', result, {
            task_count: tasks.length,
            plan: plan.plan_rationale,
            tasks: tasks.map((t) => `[${t.type}] ${t.summary}`),
        }).catch(() => {});

        return result;
    };
}

export default createOrchestratorNode;
