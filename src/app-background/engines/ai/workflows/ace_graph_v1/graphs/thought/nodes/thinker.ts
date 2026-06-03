import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import mainModel from '../../../../../models/main_model';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentThoughtEntry, AceAgentThoughtState } from '../types';

// ── Structured output schema ───────────────────────────────────────────────

const ThoughtOutputSchema = z.object({
    /** The reasoning content. */
    reasoning: z.string().describe('The detailed reasoning or analysis.'),
    /** What is this thought about? Task id, parent thought id, or topic. */
    about: z.string().optional().describe('What this thought addresses (task id, topic, etc.).'),
    /** Confidence level. */
    confidence: z
        .enum(['low', 'medium', 'high'])
        .describe('How confident are you in this reasoning?'),
    /** Suggested next step type (for supervision to route). */
    next_action: z
        .enum(['analyze', 'reflect', 'critique', 'synthesize', '__end__'])
        .describe('Suggested next action for the thought process.'),
});

type ThoughtOutput = z.infer<typeof ThoughtOutputSchema>;

// ── Prompt builders ────────────────────────────────────────────────────────

function buildThinkerSystemPrompt(): string {
    return [
        'You are a deep reasoning agent ("thinker") in a thought subgraph.',
        'Your job is to analyse problems, reflect on context, and produce structured reasoning.',
        '',
        '### Available actions',
        '- `analyze` — Deep-dive into a specific aspect of the problem.',
        '- `reflect` — Step back and consider the bigger picture, connections between ideas.',
        '- `critique` — Challenge assumptions, find gaps or weaknesses in the current reasoning.',
        '- `synthesize` — Combine multiple threads of reasoning into a coherent conclusion.',
        '- `__end__` — Reasoning is complete; return to caller.',
        '',
        '### Rules',
        '1. Be thorough — surface assumptions, unknowns, and trade-offs.',
        '2. Reference parent thoughts if available — build on or challenge them.',
        '3. Set confidence honestly — "low" if you are speculating, "high" if backed by evidence.',
        '4. Each thought should be self-contained and referenceable by `about`.',
    ].join('\n');
}

function buildThinkerContextPrompt(state: AceAgentThoughtState): string {
    const parts: string[] = [];

    parts.push(`**Original user prompt**: "${state.original_prompt}"`);

    if (state.passed_message) {
        parts.push(`**Instruction**: "${state.passed_message}"`);
    }

    if (state.parent?.thoughts?.length) {
        parts.push(
            '**Parent thoughts** (you may agree, challenge, or build upon):\n' +
                state.parent.thoughts
                    .map((t) => `- [${t.name}] (${t.confidence ?? '?'}) ${t.content.slice(0, 300)}`)
                    .join('\n'),
        );
    }

    if (state.parent?.tasks?.length) {
        parts.push(
            `**Parent tasks**: ${state.parent.tasks.map((t) => `[${t.type}] ${t.summary}`).join(', ')}`,
        );
    }

    // Recent own thoughts
    const ownThoughts = (state.thoughts ?? []).slice(-3);
    if (ownThoughts.length > 0) {
        parts.push(
            '**Your recent thoughts**:\n' +
                ownThoughts
                    .map((t) => `- [${t.name}] ${t.content.slice(0, 200)}`)
                    .join('\n'),
        );
    }

    // Current task
    const pendingTask = (state.tasks ?? []).find(
        (t) => t.status === 'pending' || t.status === 'in_progress',
    );
    if (pendingTask) {
        parts.push(`**Current task**: [${pendingTask.type}] ${pendingTask.summary}`);
    }

    return parts.join('\n\n');
}

// ── Node factory ───────────────────────────────────────────────────────────

export function createThinkerNode(nodeName: string = 'thinker') {
    return async function thinkerNode(
        state: AceAgentThoughtState,
    ): Promise<Partial<AceAgentThoughtState>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, nodeName, 'thought', state).catch(() => {});

        const model = await mainModel({
            runtime: config as never,
            structuredOutput: ThoughtOutputSchema,
        });

        const systemMsg = new SystemMessage(buildThinkerSystemPrompt());
        const contextMsg = new AIMessage(buildThinkerContextPrompt(state));

        const thought: ThoughtOutput = await model.invoke([
            systemMsg,
            ...(state.messages ?? []),
            contextMsg,
        ]);

        const entry: AceAgentThoughtEntry = {
            id: `thought-${uuid().slice(0, 8)}`,
            content: thought.reasoning,
            name: `thought-${nodeName}`,
            about: thought.about,
            confidence: thought.confidence,
            timestamp: new Date().toISOString(),
        };

        // Mark current task as completed if one was in progress
        const updatedTasks = (state.tasks ?? []).map((t) => {
            if (t.status === 'pending' || t.status === 'in_progress') {
                return { ...t, status: 'completed' as const };
            }
            return t;
        });

        const result: Partial<AceAgentThoughtState> = {
            messages: [
                ...(state.messages ?? []),
                new AIMessage({
                    content: `[${nodeName}] ${thought.reasoning.slice(0, 300)}...`,
                    name: `thought-${nodeName}`,
                }),
            ],
            thoughts: [...(state.thoughts ?? []), entry],
            tasks: updatedTasks as any,
            result_summary: thought.reasoning.slice(0, 200),
            passed_message: '',
        };

        if (threadUid) emitNodeEnd(threadUid, nodeName, 'thought', result).catch(() => {});
        return result;
    };
}

export default createThinkerNode;
