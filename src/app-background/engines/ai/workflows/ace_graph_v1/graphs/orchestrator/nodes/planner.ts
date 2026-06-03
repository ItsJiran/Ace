import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import mainModel from '../../../../../models/main_model';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentOrchestratorState } from '../types';
import type { AceAgentWorkflowTask } from '../../../types';

// ── Structured output schema ───────────────────────────────────────────────

/**
 * Planner output — tasks for the **parent** ACE graph, not the orchestrator.
 *
 * Parent graph nodes:
 * - `orchestrator` — plan, reason, gather context, adjust strategy
 * - `executor` — execute tools, run commands, modify files
 * - `summarization` — produce final summary for the user
 */
const PlannerOutputSchema = z.object({
    tasks: z
        .array(
            z.object({
                type: z
                    .enum(['orchestrator', 'executor', 'summarization', 'end'])
                    .describe('The parent ACE graph node to route to.'),
                summary: z
                    .string()
                    .describe('One sentence describing what this task should accomplish.'),
                payload: z
                    .record(z.string(), z.any())
                    .optional()
                    .describe('Extra context for the node (e.g. tool hints, file paths).'),
            }),
        )
        .describe('Ordered list of tasks for the parent ACE graph.'),
    plan_rationale: z
        .string()
        .describe('Brief explanation of the overall strategy.'),
});

type PlannerOutput = z.infer<typeof PlannerOutputSchema>;

// ── System prompt ───────────────────────────────────────────────────────────

function buildPlannerSystemPrompt(): string {
    return [
        'You are a strategic planner in an AI agent workflow (ACE graph).',
        'Your job: read the reasoning produced by the `thought` step and turn it into',
        'a concrete, ordered task plan for the **parent** workflow graph.',
        '',
        '### Parent Graph Nodes',
        '',
        '| Node | Purpose | When to use |',
        '|------|---------|-------------|',
        '| `orchestrator` | Plan, reason, gather context, adjust strategy. Think of it as the "brain". | When more analysis or context is needed before acting. |',
        '| `executor` | Execute concrete actions — run tools, modify files, run commands. | When the plan calls for direct action. |',
        '| `summarization` | Produce a final, user-facing summary of everything that happened. | Once all tasks are done and the user needs the answer. |',
        '| `end` | Terminate the workflow. | Last task only. |',
        '',
        '### Patterns',
        '',
        '**Simple action** (one step, no deep analysis):',
        '  orchestrator (plan) → executor (do it) → summarization → end',
        '',
        '**Complex multi-step**:',
        '  orchestrator (gather context) → executor (step 1) → orchestrator (review) → executor (step 2) → summarization → end',
        '',
        '**Pure Q&A** (no tools needed):',
        '  orchestrator (analyse) → summarization → end',
        '',
        '### Rules',
        '1. Always read the `thought` output in messages — it contains the reasoning.',
        '2. Each task must have a clear, one-sentence `summary`.',
        '3. Use `payload` for node-specific hints (tool names, file paths, constraints).',
        '4. Always end with `summarization` then `end`.',
        '5. Do NOT create orchestrator tasks that duplicate what the orchestrator already did in `thought`.',
    ].join('\n');
}

function buildPlannerContextPrompt(state: AceAgentOrchestratorState): string {
    const parts: string[] = [];

    parts.push(`**Original user prompt**: "${state.original_prompt}"`);

    if (state.passed_message) {
        parts.push(`**Instruction**: "${state.passed_message}"`);
    }

    if (state.parent?.tasks?.length) {
        parts.push(
            `**Existing parent tasks** (adjust or replace):\n${state.parent.tasks.map((t) => `- [${t.type}:${t.status}] ${t.summary}`).join('\n')}`,
        );
    }

    if (state.parent?.target_node) {
        parts.push(
            `**Parent routing intent**: target=${state.parent.target_node}, reason="${state.parent.target_node_reason}"`,
        );
    }

    // Latest context info
    if (state.context?.tools?.length) {
        parts.push(
            `**Available tools**: ${state.context.tools.map((t) => t.name).join(', ')}`,
        );
    }

    if (state.context?.files?.length) {
        parts.push(
            `**Relevant files**: ${state.context.files.map((f) => f.path).join(', ')}`,
        );
    }

    parts.push(
        'Based on the thought output and context above, generate an ordered task plan for the parent ACE graph.',
    );

    return parts.join('\n\n');
}

// ── Example output ─────────────────────────────────────────────────────────

function buildPlannerExamplePrompt(): string {
    return [
        '### Example Output',
        '',
        '**Scenario**: User asks "refactor auth module to use JWT". Thought already analysed the problem.',
        '',
        '```json',
        '{',
        '  "tasks": [',
        '    { "type": "orchestrator", "summary": "Gather context: find all auth-related files and current session implementation" },',
        '    { "type": "executor", "summary": "Replace session-based auth with JWT token generation and validation" },',
        '    { "type": "orchestrator", "summary": "Review executor output — verify JWT implementation is complete" },',
        '    { "type": "summarization", "summary": "Summarise the refactored auth module changes for the user" },',
        '    { "type": "end", "summary": "Workflow complete" }',
        '  ],',
        '  "plan_rationale": "Two-phase approach: first gather context via orchestrator, then execute the refactor, review, and summarise. Ended with summarization."',
        '}',
        '```',
        '',
        '**Scenario**: User asks "what does git status do?". Already know the answer — no tools needed.',
        '',
        '```json',
        '{',
        '  "tasks": [',
        '    { "type": "orchestrator", "summary": "Analyse: this is a straightforward Q&A — answer directly" },',
        '    { "type": "summarization", "summary": "Explain what git status does and its common flags" },',
        '    { "type": "end", "summary": "Workflow complete" }',
        '  ],',
        '  "plan_rationale": "Pure Q&A — no executor needed. orchestrator confirms the approach, summarization delivers the answer."',
        '}',
        '```',
    ].join('\n');
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function toParentTasks(plan: PlannerOutput): AceAgentWorkflowTask[] {
    return plan.tasks.map((t, i) => ({
        id: `ace-task-${Date.now()}-${i}`,
        type: t.type,
        summary: t.summary,
        payload: t.payload ?? {},
        status: 'pending' as const,
    }));
}

// ── Node factory ────────────────────────────────────────────────────────────

/**
 * Planner node — reads the `thought` output and creates a task plan for
 * the **parent** ACE graph. The plan defines what the parent should do
 * next: more orchestrator analysis, executor actions, or summarization.
 */
export function createPlannerNode() {
    return async function plannerNode(
        state: AceAgentOrchestratorState,
    ): Promise<Partial<AceAgentOrchestratorState>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'planner', 'orchestrator', state).catch(() => {});

        const model = await mainModel({
            runtime: config as never,
            structuredOutput: PlannerOutputSchema,
        });

        const systemMsg = new SystemMessage(
            [buildPlannerSystemPrompt(), buildPlannerExamplePrompt()].join('\n\n'),
        );
        const contextMsg = new AIMessage(buildPlannerContextPrompt(state));

        const plan: PlannerOutput = await model.invoke([
            systemMsg,
            ...(state.messages ?? []),
            contextMsg,
        ]);

        const parentTasks = toParentTasks(plan);

        // Mark the planner task as completed
        const updatedTasks = (state.tasks ?? []).map((t) => {
            if (t.type === 'planner' && (t.status === 'pending' || t.status === 'in_progress')) {
                return { ...t, status: 'completed' as const };
            }
            return t;
        });

        const result: Partial<AceAgentOrchestratorState> = {
            messages: [
                ...(state.messages ?? []),
                new AIMessage({
                    content: `Parent plan: ${plan.plan_rationale}\nTasks: ${parentTasks.map((t) => `[${t.type}] ${t.summary}`).join(', ')}`,
                    name: 'orchestrator-planner',
                }),
            ],
            tasks: updatedTasks,
            result_summary: `Planned ${parentTasks.length} tasks for parent: ${plan.plan_rationale}`,
            // Store parent tasks in context so orchestrator supervisor can return them
            context: {
                ...(state.context ?? {}),
                // HACK: temporarily store parent tasks here until we have a dedicated field
                recent_node_results: [
                    ...(state.context?.recent_node_results ?? []),
                    {
                        node_name: 'orchestrator-planner',
                        result_summary: `Planned for parent: ${parentTasks.map((t) => `[${t.type}] ${t.summary}`).join('; ')}`,
                    },
                ],
            },
        };

        if (threadUid) emitNodeEnd(threadUid, 'planner', 'orchestrator', result).catch(() => {});
        return result;
    };
}

export default createPlannerNode;
