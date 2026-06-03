import { z } from 'zod';
import { getConfig } from '@langchain/langgraph';
import mainModel from '../../../../models/main_model';
import type { AceAgentWorkflowState, AceAgentWorkflowTask } from '../../types';

// ── Structured output schema ───────────────────────────────────────────────

const SupervisionDecision = z.object({
    next_node: z
        .enum([
            'orchestrator',
            'executor',
            'summarization',
            '__end__',
        ])
        .describe('The next workflow node to execute.'),
    reasoning: z
        .string()
        .describe('One sentence explaining why this node was chosen.'),
});

type SupervisionDecisionType = z.infer<typeof SupervisionDecision>;

// ── Phase 1: Explicit target transition ────────────────────────────────────

/**
 * Honour an explicit `target_node` set by the previous node.
 * Returns the target node name, or `null` to fall through.
 */
function resolveExplicitTarget(state: AceAgentWorkflowState): string | null {
    if (state.target_node) return state.target_node;
    return null;
}

// ── Phase 2: Task-driven routing ───────────────────────────────────────────

/**
 * Check for pending or in-progress tasks and return the first one's type.
 * Returns `null` when no actionable task exists.
 */
function resolvePendingTaskRoute(
    tasks: AceAgentWorkflowTask[],
): string | null {
    const pendingTask = tasks.find(
        (t) => t.status === 'pending' || t.status === 'in_progress',
    );
    if (!pendingTask) return null;

    // 'end' maps to LangGraph's END sentinel
    return pendingTask.type === 'end' ? '__end__' : pendingTask.type;
}

// ── Phase 3: Prompt assembly ───────────────────────────────────────────────

/**
 * Build the routing prompt from recent execution context so the model can
 * decide which workflow node should run next.
 */
function buildRoutingPrompt(state: AceAgentWorkflowState): string {
    const recentResults = state.context?.recent_node_results ?? [];
    const lastThree = recentResults.slice(-3);
    const tasks = state.tasks ?? [];

    return [
        lastThree.length > 0
            ? `Recent node results:\n${lastThree.map((r) => `- [${r.node_name}] ${r.result_summary}`).join('\n')}`
            : 'This is the initial routing — no recent node results yet.',
        `Original user prompt: "${state.original_prompt}"`,
        tasks.length > 0
            ? `Pending tasks: ${tasks.map((t) => `[${t.type}] ${t.summary}`).join(', ')}`
            : 'No pending tasks.',
    ].join('\n\n');
}

// ── Phase 4: Model-driven routing ──────────────────────────────────────────

/**
 * Ask the main model with structured output to decide the next workflow node.
 */
async function resolveModelRoute(
    state: AceAgentWorkflowState,
): Promise<string> {
    const config = getConfig();
    const model = await mainModel({
        runtime: config as never,
        structuredOutput: SupervisionDecision,
    });

    const prompt = buildRoutingPrompt(state);

    const decision: SupervisionDecisionType =
        await model.invoke(prompt);

    return decision.next_node;
}

// ── Main supervision edge ──────────────────────────────────────────────────

/**
 * Supervision edge — the central router of the workflow.
 *
 * Routing priority:
 * 1. Explicit target    → `resolveExplicitTarget`
 * 2. Pending tasks      → `resolvePendingTaskRoute`
 * 3. Model decision     → `resolveModelRoute`
 */
export async function supervisionEdge(
    state: AceAgentWorkflowState,
): Promise<string> {
    // Phase 1: explicit target_node
    const explicit = resolveExplicitTarget(state);
    if (explicit !== null) return explicit;

    // Phase 2: pending tasks
    const taskRoute = resolvePendingTaskRoute(state.tasks ?? []);
    if (taskRoute !== null) return taskRoute;

    // Phase 3+4: build prompt & ask the model
    return resolveModelRoute(state);
}

export default supervisionEdge;
