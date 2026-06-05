import { z } from 'zod';
import { getConfig } from '@langchain/langgraph';
import mainModel from '../../../../../models/main_model';
import type { AceAgentThoughtState, AceAgentThoughtTask } from '../types';

// ── Structured output schema ───────────────────────────────────────────────

const ThoughtSupervisionDecision = z.object({
    next_node: z
        .enum(['analyze', 'reflect', 'critique', 'synthesize', '__end__'])
        .describe('The next node to execute within the thought subgraph.'),
    reasoning: z
        .string()
        .describe('One sentence explaining why this node was chosen.'),
});

// ── Phase 1: Passed-message handling ───────────────────────────────────────

function resolvePassedMessage(state: AceAgentThoughtState): string | null {
    if (!state.passed_message) return null;
    return 'analyze';
}

// ── Phase 2: Task evaluation ───────────────────────────────────────────────

function resolveTaskRoute(tasks: AceAgentThoughtTask[]): string | null {
    if (tasks.length === 0) return null;

    const pendingTask = tasks.find(
        (t) => t.status === 'pending' || t.status === 'in_progress',
    );
    if (pendingTask) return pendingTask.type;

    const allDone = tasks.every((t) => t.status === 'completed');
    if (allDone) return '__end__';

    return '__end__';
}

// ── Phase 3: Prompt assembly ───────────────────────────────────────────────

function buildRoutingPrompt(state: AceAgentThoughtState): string {
    const tasks = state.tasks ?? [];
    const recentThoughts = (state.thoughts ?? []).slice(-3);

    return [
        recentThoughts.length > 0
            ? `Recent thoughts:\n${recentThoughts.map((t) => `- [${t.name}] ${t.content.slice(0, 200)}`).join('\n')}`
            : 'No thoughts yet — beginning analysis.',
        `Original user prompt: "${state.original_prompt}"`,
        state.passed_message
            ? `Passed instruction: "${state.passed_message}"`
            : null,
        tasks.length > 0
            ? `Tasks: ${tasks.map((t) => `[${t.type}:${t.status}] ${t.summary}`).join(', ')}`
            : 'No tasks yet.',
    ]
        .filter(Boolean)
        .join('\n\n');
}

// ── Phase 4: Model-driven routing ──────────────────────────────────────────

async function resolveModelRoute(state: AceAgentThoughtState): Promise<string> {
    const config = getConfig();
    const model = await mainModel({
        runtime: config as never,
        structuredOutput: ThoughtSupervisionDecision,
    });

    const prompt = buildRoutingPrompt(state);
    const decision = await model.invoke(prompt as any);
    return (decision as any).next_node;
}

// ── Main supervision edge ──────────────────────────────────────────────────

export async function thoughtSupervisionEdge(
    state: AceAgentThoughtState,
): Promise<string> {
    // Phase 0: liveness check — stop immediately if interrupted
    if ((state as any).is_interrupted) return '__end__';

    // Phase 1: passed_message
    const passedRoute = resolvePassedMessage(state);
    if (passedRoute !== null) return passedRoute;

    // Phase 2: task-driven
    const tasks = state.tasks ?? [];
    const taskRoute = resolveTaskRoute(tasks);
    if (taskRoute !== null) return taskRoute;

    // Phase 3: no tasks → bootstrap
    if (tasks.length === 0) return 'analyze';

    // Phase 4: model-driven
    return resolveModelRoute(state);
}
