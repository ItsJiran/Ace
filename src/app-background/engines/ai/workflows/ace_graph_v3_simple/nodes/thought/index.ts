/**
 * Thought Node — Observe the user prompt and previous cycle results.
 *
 * Produces a concise observation that feeds into the action node for classification.
 *
 * Flow: START → thought → action → review → thought (loop) or END
 */

import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { Command, END, getConfig } from '@langchain/langgraph';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import type { AceAgentV3State } from '../../types';

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_CYCLES = 20;

// ── Prompts ────────────────────────────────────────────────────────────────

function analyzePrompt(state: AceAgentV3State): string {
    const cycles = state.cycles ?? [];
    const lastCycle = cycles[cycles.length - 1];

    const lines = [
        'You are an AI agent. Your job is to OBSERVE and ASSESS — not to plan actions yet.',
        '',
        `### User Request`,
        `"${state.original_prompt}"`,
        '',
    ];

    if (cycles.length === 0) {
        lines.push(
            '### First Cycle — No History',
            '- This is a fresh request. Analyze what the user wants.',
            '- Is it a simple greeting, a factual question, or a complex task?',
            '- Be honest: if it is just "hello", say so.',
        );
    } else {
        lines.push(
            '',
            '### History',
            ...cycles.slice(-5).map((c, i) =>
                `  ${cycles.length - 4 + i}. "${c.subject}" → ${c.action.target.name} → "${c.review_result ?? '...'}"`,
            ),
        );
        
        if (lastCycle?.review_result) {
            lines.push(
                '',
                '### Last Result',
                `"${lastCycle.review_result}"`,
            );
        }
        
    }

    if (state.target_node_reason) {
        lines.push('', `Re-entry context: "${state.target_node_reason}"`);
    }

    lines.push(
        '',
        '### Instructions',
        '- Observe the user request and previous cycle results.',
        '- What does the user want? What has already been done? What remains?',
        '- Output a concise observation (1-3 sentences). Be specific.',
        '- Pattern: "From [source], I observe that [insight]."',
        '',
        '### Ending the Session',
        '- If based on the user prompt AND recent cycle history the request is fully satisfied,',
        '  end with: "From [what was done], I have completed [the request]. I can end this agentic session."',
        '- Example: "From greeting the user, I have completed the conversation. I can end this agentic session."',
        '- Example: "From installing express, I have completed the user request. I can end this agentic session."',
        '- Otherwise, describe what remains to be done.',
        `Cycle: ${cycles.length + 1} / ${MAX_CYCLES}`,
    );

    return lines.join('\n');
}

// ── Node ───────────────────────────────────────────────────────────────────

export function createThoughtNode() {
    return async function thoughtNode(state: AceAgentV3State): Promise<Partial<AceAgentV3State> | Command> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'thought', 'ace-v3', state).catch(() => {});

        if (threadUid && !KernelEngine.readMemory(`thread:active:${threadUid}`)) {
            return new Command({ goto: END });
        }

        const cycleNum = (state.global_cycle ?? 0) + 1;

        // Hard gate
        if (cycleNum > MAX_CYCLES) {
            return {
                global_cycle: cycleNum,
                target_node: '__end__',
                from_node: 'thought',
            };
        }

        // Observe
        const observation = await invokeLLM({
            runtime: getConfig() as never,
            messages: [new SystemMessage(analyzePrompt(state))],
            nodeName: 'thought',
            graphName: 'ace-v3',
        });

        const observationStr = typeof observation === 'string' ? observation : JSON.stringify(observation ?? 'No observation.');

        const subject = state.target_node_reason
            || state.cycles?.[state.cycles.length - 1]?.review_result
            || state.original_prompt;

        const cycle = {
            subject,
            thought: observationStr,
            action: {
                thought: '', // filled by action node after classification
                target: { name: '', reason: '' },
            },
        };

        const output: Partial<AceAgentV3State> = {
            messages: [new AIMessage({
                content: observationStr.slice(0, 200),
                name: 'ace-v3-thought',
            })],
            cycles: [cycle],
            current_cycle: cycle,
            global_cycle: cycleNum,
            target_node: 'action',
            from_node: 'thought',
        };

        if (threadUid) emitNodeEnd(threadUid, 'thought', 'ace-v3', output, {
            cycle: cycleNum,
        }).catch(() => {});

        return output;
    };
}
