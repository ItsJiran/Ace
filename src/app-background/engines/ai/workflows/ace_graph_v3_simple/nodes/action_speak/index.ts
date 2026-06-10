/**
 * Action: Speak — respond to the user with a helpful, natural message.
 *
 * Uses shared prompt builders for memory, context, and cycle history
 * so the response is aware of what has been done and what the user knows.
 */

import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { Command, END, getConfig } from '@langchain/langgraph';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import { buildErrorRecoveryCommand } from '../recovery-error-helper';
import { writeActionOutput, writeActionResult } from '#/app-background/lib/utils/thread-storage';
import {
    buildMemorySection,
    buildContextSection,
    buildCycleHistory,
    buildLastCycleHighlight,
    preFetchExpandedData,
    type ExpandedCycleMap,
} from '#/app-background/lib/utils/ai/prompt-builders';
import type { AceAgentV3State } from '../../types';

// ── Action-Specific Prompt ─────────────────────────────────────────────────

function buildActionSpeakPrompt(
    state: AceAgentV3State,
    cycles: AceAgentV3State['cycles'],
    expandedData: ExpandedCycleMap,
    actionReason: string,
): string {
    const sections: string[][] = [
        // ── PRIMARY: What to say (put FIRST so agent focuses on this) ──
        [
            '### YOUR ONLY JOB',
            'You are the AI agent. The instruction below is YOUR internal plan.',
            'Respond to the user naturally. Your response should accomplish this:',
            `→ ${actionReason}`,
            '',
            'IMPORTANT: You already know any information mentioned — do NOT act surprised',
            'or confirm it back to the user as if they just told you.',
            'Pattern: the reason tells you what to accomplish — respond as if you naturally know it.',
            'Example 1 — reason: "Confirm that user_name is Alex" → say "Got it, Alex!" NOT "Yes, your name is Alex."',
            'Example 2 — reason: "Acknowledge env_os is Linux" → say "You\'re on Linux." NOT "I understand you use Linux."',
            'Example 3 — reason: "Greet the user" → say "Hello! How can I help?" NOT "I will now greet the user."',
            'Just respond as a helpful assistant who naturally knows the context.',
            '',
            'Do NOT output the instruction above. Output the actual response.',
            'Do NOT analyze, do NOT explain what you are doing, do NOT add meta-commentary.',
            '',
        ],
        // ── Supporting context (helps inform the response) ──
        buildMemorySection(state),
        buildContextSection(state),
        cycles.length > 0
            ? [
                '### Background — What Happened So Far',
                ...buildCycleHistory(cycles, expandedData),
                ...buildLastCycleHighlight(cycles),
              ]
            : [],
        // ── Guidelines (reinforce at the end) ──
        [
            '### Guidelines',
            '- MATCH the user\'s language. If they wrote in Indonesian, respond in Indonesian.',
            '  If they wrote in English, respond in English. Detect from the user request.',
            '- Be concise and natural. Do not be overly verbose.',
            '- If the user asked a question, answer it directly.',
            '- If the user gave a greeting, respond warmly.',
            '- If this is a progress update, briefly summarize what was done.',
            '- Reference context from memory/background ONLY if it helps your response.',
            '- Output ONLY the response text. No prefixes, no JSON, no markdown wrappers.',
            '',
            'REMEMBER — your response should accomplish:',
            `→ ${actionReason}`,
        ],
    ];

    return sections.flat().filter(Boolean).join('\n');
}

export function createActionSpeak() {
    return async function actionSpeak(
        state: AceAgentV3State,
    ): Promise<Partial<AceAgentV3State> | Command> {
        try {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id ?? 'unknown';
        if (threadUid) emitNodeStart(threadUid, 'action_speak', 'ace-v3', state).catch(() => {});

        if (threadUid && !KernelEngine.readMemory(`thread:active:${threadUid}`)) {
            return new Command({ goto: END });
        }

        const cycle = state.current_cycle;

        // Get the RUNNING action's reason — this is "what to say"
        const runningAction = cycle?.actions?.find(a => a.status === 'running');
        const actionReason = runningAction?.target?.reason ?? 'Respond to the user.';

        // Pre-fetch cycle history for context
        const cycles = state.cycles ?? [];
        const expandedData = await preFetchExpandedData(cycles);

        // Build prompt with memory, context, and cycle history
        const systemPrompt = buildActionSpeakPrompt(
            state,
            cycles,
            expandedData,
            actionReason,
        );

        const { resolved, message } = await invokeLLM({
            runtime: getConfig() as never,
            messages: [new SystemMessage(systemPrompt)],
            nodeName: 'action_speak',
            graphName: 'ace-v3',
        });

        // Write output & result to thread storage, store pointers on the running action
        const cycleIndex = (state.cycles ?? []).length - 1;
        const runningActionIdx = cycle?.actions?.findIndex(a => a.status === 'running') ?? 0;
        if (runningAction && threadUid) {
            runningAction.output = await writeActionOutput(threadUid, cycleIndex, runningActionIdx, { prompt: systemPrompt }).catch(() => '');
            runningAction.result = await writeActionResult(threadUid, cycleIndex, runningActionIdx, { reply: typeof resolved === 'string' ? resolved : JSON.stringify(resolved) }).catch(() => '');
        }

        const output: Partial<AceAgentV3State> = {
            messages: [message],
            current_cycle: cycle,
            target_node: 'action_dispatcher',
            from_node: 'action_speak',
        };

        if (threadUid) emitNodeEnd(threadUid, 'action_speak', 'ace-v3', output).catch(() => {});
        return output;
        } catch (error) {
            console.error('[action_speak] Error:', error);
            return buildErrorRecoveryCommand(error, 'action_speak');
        }
    };
}
