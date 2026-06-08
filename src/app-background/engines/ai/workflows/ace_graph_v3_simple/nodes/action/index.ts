/**
 * Action Node — Stage 2: Classify & Route.
 *
 * Reads the thought node's observation + assessment,
 * classifies which action to take, then routes to the sub-node.
 *
 * Supported targets: action_speak, action_tool, action_context, action_mcp.
 */

import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { Command, END, getConfig } from '@langchain/langgraph';
import { z } from 'zod';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import type { AceAgentV3State } from '../../types';

// ── Structured output ─────────────────────────────────────────────────────

const ActionClassify = z.object({
    action_plan: z.string().describe(
        'What action should be executed RIGHT NOW? ' +
        'Be specific: what tool to run, what command, what to say, what file to read.\n' +
        'Examples:\n' +
        '  - Respond with a friendly greeting: "Hello! How can I help you today?"\n' +
        '  - Run: npm install express --save\n' +
        '  - Read file: ./package.json to check existing dependencies\n' +
        '  - Run: ls -la ./src to inspect project structure',
    ),
    target_name: z.string().describe(
        'Route to: action_speak (respond to user), ' +
        'action_tool (run code/commands/install), ' +
        'action_context (read files/inspect state/gather info), ' +
        'action_mcp (external protocol integration), ' +
        'end (request fully satisfied — nothing more to do).\n' +
        'Examples:\n' +
        '  - Greeting → action_speak\n' +
        '  - Install package → action_tool\n' +
        '  - Check file content → action_context\n' +
        '  - All done, user answered → end',
    ),
    target_reason: z.string().describe(
        'One sentence: why this target was chosen over the others.\n' +
        'Examples:\n' +
        '  - "Simple greeting — respond directly, no tools needed."\n' +
        '  - "Need to run a shell command to install the package."\n' +
        '  - "Request fully satisfied — user has been answered."',
    ),
});

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_CYCLES = 20;

const TARGET_MAP: Record<string, string> = {
    action_speak: 'action_speak',
    action_tool: 'action_tool',
    action_context: 'action_context',
    action_mcp: 'action_mcp',
};

// ── Prompt ─────────────────────────────────────────────────────────────────

function classifyPrompt(state: AceAgentV3State): string {
    const cycles = state.cycles ?? [];
    const cycleThought = state.current_cycle?.thought ?? 'No analysis yet.';

    return [
        'You are an AI agent. Based on the thought analysis, choose the NEXT action.',
        '',
        '### Agent Analysis',
        `"${cycleThought}"`,
        '',
        '### User Request',
        `"${state.original_prompt}"`,
        '',
        '### Available Actions',
        '- `action_speak` — Respond to the user. Use for greetings, answers, explanations, summaries.',
        '- `action_tool` — Execute code, run shell commands, install packages, modify files.',
        '- `action_context` — Read files, inspect config, gather system information.',
        '- `action_mcp` — Use external Model Context Protocol tools.',
        '- `end` — Nothing more to do. The request is fully satisfied.',
        '',
        '### Decision Rules',
        '- If the analysis says "I can end this agentic session" → `end`. The task is complete.',
        '- Simple greeting / small talk / factual answer → `action_speak`.',
        '- Need to run code, check files, or gather context → `action_tool` or `action_context`.',
        '- All steps complete and user has been answered → `end`.',
        '',
        `Cycles used: ${cycles.length} / ${MAX_CYCLES}.`,
        cycles.length >= MAX_CYCLES - 3
            ? '⚠️ Approaching max cycles. Choose "end" unless critical work remains.'
            : '',
        '',
        'Output: action_plan, target_name, target_reason.',
    ].filter(Boolean).join('\n');
}

// ── Node ───────────────────────────────────────────────────────────────────

export function createActionNode() {
    return async function actionNode(state: AceAgentV3State): Promise<Partial<AceAgentV3State> | Command> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action', 'ace-v3', state).catch(() => {});

        if (threadUid && !KernelEngine.readMemory(`thread:active:${threadUid}`)) {
            return new Command({ goto: END });
        }

        const cycle = state.current_cycle;
        if (!cycle) return { target_node: 'review', from_node: 'action' };

        // Quick check: thought says the session can end → skip LLM, route to action_end
        const isComplete = cycle.thought.includes('I can end this agentic session') ||
            cycle.thought.includes('can end this agentic session');

        if (isComplete) {
            cycle.action = {
                thought: 'Session complete — nothing more to do.',
                target: { name: 'end', reason: cycle.thought },
            };

            return {
                messages: [new AIMessage({
                    content: '[end] Session complete.',
                    name: 'ace-v3-action',
                })],
                current_cycle: cycle,
                target_node: 'action_end',
                target_node_reason: cycle.thought,
                from_node: 'action',
            };
        }

        // Classify
        const classify = await invokeLLM({
            runtime: getConfig() as never,
            structuredOutput: ActionClassify,
            messages: [new SystemMessage(classifyPrompt(state))],
            nodeName: 'action',
            graphName: 'ace-v3',
        });

        // Update cycle with classification result
        const actionPlan = classify?.action_plan ?? 'No action plan.';
        const targetName = classify?.target_name ?? 'action_speak';
        const targetReason = classify?.target_reason ?? 'Fallback.';

        cycle.action = {
            thought: actionPlan,
            target: {
                name: targetName,
                reason: targetReason,
            },
        };

        const isEnd = targetName === 'end';
        const subNode = isEnd ? 'action_end' : TARGET_MAP[targetName] ?? 'action_speak';

        const output: Partial<AceAgentV3State> = {
            messages: [new AIMessage({
                content: `[${targetName}] ${actionPlan.slice(0, 120)}`,
                name: 'ace-v3-action',
            })],
            current_cycle: cycle,
            target_node: isEnd ? 'action_end' : subNode,
            target_node_reason: targetReason,
            from_node: 'action',
        };

        if (threadUid) emitNodeEnd(threadUid, 'action', 'ace-v3', output, {
            target: targetName,
        }).catch(() => {});

        return output;
    };
}
