import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV2State } from '../../types';

// ── Structured outputs ─────────────────────────────────────────────────────

/** Stage 1: internal monologue. */
const InternalThought = z.object({
    thought: z.string().describe('Internal monologue: what you think about the current situation. Analyze the user prompt, previous steps, and results.'),
});

/** Stage 2: classify next action. */
const ActionClassify = z.object({
    action: z.enum(['create_step', 'create_task', 'done']).describe(
        'create_step=need multi-task planning via orchestrator. ' +
        'create_task=need a single immediate task via executor. ' +
        'done=all work complete, end the conversation.',
    ),
    reasoning: z.string().describe('Why this action was chosen.'),
});

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_GLOBAL_ITERATIONS = 5;

// ── Prompts ────────────────────────────────────────────────────────────────

function thinkPrompt(state: AceAgentV2State): string {
    const steps = state.steps ?? [];
    const prevThoughts = state.thoughts ?? [];
    const isReEntry = state.global_iteration > 0;

    const lines = [
        'You are an AI agent analyzing the current situation. Write your internal monologue.',
        '',
        `User prompt: "${state.original_prompt}"`,
    ];

    if (isReEntry) {
        lines.push(
            '',
            '### Re-entry Context',
            `You are re-evaluating after ${state.global_iteration} iteration(s).`,
            state.target_node_reason ? `Last feedback: "${state.target_node_reason}"` : '',
        );
    }

    if (prevThoughts.length > 0) {
        lines.push(
            '',
            '### Previous Thoughts',
            ...prevThoughts.map((t, i) => `  ${i + 1}. [${t.action}] ${t.thought}`),
        );
    }

    if (steps.length > 0) {
        lines.push(
            '',
            '### Steps Taken So Far',
            ...steps.map((s, i) =>
                `  ${i + 1}. [${s.status}] ${s.phase}${s.output ? ` → ${s.output.slice(0, 120)}` : ''}`,
            ),
        );
    }

    lines.push(
        '',
        '### Instructions',
        '- Analyze what has been done so far.',
        '- Consider what still needs to be accomplished.',
        '- Be honest: if stuck, acknowledge it.',
        '- Keep your monologue focused and concise.',
    );

    return lines.filter(Boolean).join('\n');
}

function classifyPrompt(state: AceAgentV2State, thought: string): string {
    const steps = state.steps ?? [];

    return [
        'Based on your internal monologue, classify the NEXT action.',
        '',
        `Your thought: "${thought}"`,
        '',
        '### Action Guide',
        '- `create_step` — you need a multi-task plan (e.g. "gather context, then implement, then verify").',
        '- `create_task` — you need ONE immediate task (e.g. "greet the user", "read a file").',
        '- `done` — the user request is fully satisfied. No more work needed.',
        '',
        steps.length > 0
            ? `Steps taken: ${steps.length}. Max steps before forced end: 8.`
            : 'No steps taken yet.',
        state.global_iteration > 0
            ? `Iteration: ${state.global_iteration}. Max iterations: ${MAX_GLOBAL_ITERATIONS}. Choose "done" if you are stuck or looping.`
            : '',
        '',
        'Choose wisely. Only "done" when truly finished.',
    ].filter(Boolean).join('\n');
}

// ── Node ───────────────────────────────────────────────────────────────────

/**
 * Thought node — the central brain. Every loop returns here.
 *
 * Stage 1: Internal monologue (analyze state)
 * Stage 2: Classify action → route accordingly
 *
 * Flow:
 *   START → thought ─┬─ create_step → orchestrator_step → ... → review_step ─┐
 *                    ├─ create_task → executor → ... → review_task ─────────┤
 *                    └─ done → __end__                                       │
 *                                                                           │
 *                    ◄── ALL review nodes return here ──────────────────────┘
 */
export function createThoughtNode() {
    return async function thoughtNode(state: AceAgentV2State): Promise<Partial<AceAgentV2State>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'thought', 'ace-v2', state).catch(() => {});

        if (state.is_stopped) return { result_summary: 'Stopped.', from_node: 'thought' };

        const iteration = (state.global_iteration ?? 0) + 1;

        // Hard gate: max iterations
        if (iteration > MAX_GLOBAL_ITERATIONS) {
            return {
                global_iteration: iteration,
                target_node: '__end__',
                from_node: 'thought',
                result_summary: `Max iterations (${MAX_GLOBAL_ITERATIONS}) reached.`,
            };
        }

        // Stage 1: Internal monologue
        const think = await invokeLLM({
            runtime: getConfig() as never,
            structuredOutput: InternalThought,
            messages: [new SystemMessage(thinkPrompt(state))],
            nodeName: 'thought',
            graphName: 'ace-v2',
        });

        // Stage 2: Classify action
        const classify = await invokeLLM({
            runtime: getConfig() as never,
            structuredOutput: ActionClassify,
            messages: [new SystemMessage(classifyPrompt(state, think.thought))],
            nodeName: 'thought',
            graphName: 'ace-v2',
        });

        const thoughtEntry = {
            thought: think.thought,
            action: classify.action,
            reasoning: classify.reasoning,
        };

        const targetNode =
            classify.action === 'create_step' ? 'orchestrator_step' :
            classify.action === 'create_task' ? 'executor' :
            '__end__';

        const output: Partial<AceAgentV2State> = {
            messages: [new AIMessage({
                content: `[${classify.action}] ${think.thought.slice(0, 100)}`,
                name: 'ace-v2-thought',
            })],
            thoughts: [thoughtEntry],
            global_iteration: iteration,
            target_node: targetNode,
            target_node_reason: classify.reasoning,
            from_node: 'thought',
            result_summary: classify.reasoning,
        };

        if (threadUid) emitNodeEnd(threadUid, 'thought', 'ace-v2', output, {
            action: classify.action,
            iteration,
        }).catch(() => {});

        return output;
    };
}
