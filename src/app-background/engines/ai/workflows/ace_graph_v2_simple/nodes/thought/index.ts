import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import type { AceAgentV2State } from '../../types';

// ── Structured output ──────────────────────────────────────────────────────

const ThoughtOutput = z.object({
    thoughts: z.array(z.string().describe('A single actionable thought about what the user wants.'))
        .describe('Breakdown of user prompt into clear, atomic thoughts. Keep each short and focused.'),
});

// ── Prompt ─────────────────────────────────────────────────────────────────

function thoughtPrompt(state: AceAgentV2State): string {
    return [
        'You are breaking down a user prompt into discrete, atomic thoughts.',
        'Each thought is a single focused idea — prevent over-planning at this stage.',
        '',
        `User prompt: "${state.original_prompt}"`,
        '',
        '### Rules',
        '- Each thought should be ONE clear, actionable idea.',
        '- Keep thoughts short (1 sentence max).',
        '- Do NOT plan solutions — just capture WHAT the user wants.',
        '- 3-5 thoughts is usually sufficient.',
        '- Order them logically.',
    ].join('\n');
}

// ── Node ───────────────────────────────────────────────────────────────────

/**
 * Thought node — breaks down the user prompt into an array of thoughts.
 * Sits at the very start of the graph (START → thought → orchestrator_goal).
 * Goals are then built FROM these thoughts to prevent over-planning.
 */
export function createThoughtNode() {
    return async function thoughtNode(state: AceAgentV2State): Promise<Partial<AceAgentV2State>> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'thought', 'ace-v2', state).catch(() => {});

        if (state.is_stopped) return { result_summary: 'Stopped.', from_node: 'thought' };

        const result = await invokeLLM({
            runtime: getConfig() as never,
            structuredOutput: ThoughtOutput,
            messages: [new SystemMessage(thoughtPrompt(state))],
            nodeName: 'thought',
            graphName: 'ace-v2',
        });

        const output: Partial<AceAgentV2State> = {
            messages: [new AIMessage({
                content: `Thoughts: ${result.thoughts.map((t : any, i : any) => `${i + 1}. ${t}`).join(' | ')}`,
                name: 'ace-v2-thought',
            })],
            thoughts: result.thoughts,
            from_node: 'thought',
            result_summary: `${result.thoughts.length} thoughts captured.`,
        };

        if (threadUid) emitNodeEnd(threadUid, 'thought', 'ace-v2', output, {
            thoughtCount: result.thoughts.length,
        }).catch(() => {});

        return output;
    };
}
