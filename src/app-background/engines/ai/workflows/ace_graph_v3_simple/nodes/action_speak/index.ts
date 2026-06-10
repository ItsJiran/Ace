/**
 * Action: Speak — respond to the user with a helpful, natural message.
 */

import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { Command, END, getConfig } from '@langchain/langgraph';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import { buildErrorRecoveryCommand } from '../recovery-error-helper';
import { writeActionOutput, writeActionResult } from '#/app-background/lib/utils/thread-storage';
import type { AceAgentV3State } from '../../types';

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
        const actionPlan = cycle?.actions?.[0]?.thought ?? 'Respond to the user.';
        const originalPrompt = state.original_prompt;
        const cycleThought = cycle?.thought ?? '';
        const lastMsg = state.messages?.[state.messages.length - 1];
        const lastResult =
            typeof lastMsg?.content === 'string' ? lastMsg.content.slice(0, 300) : undefined;

        const systemPrompt = [
            'You are a helpful AI assistant responding to the user.',
            '',
            '### User Request',
            `"${originalPrompt}"`,
            '',
            '### What To Say',
            `Plan: ${actionPlan}`,
            '',
            cycleThought ? `### Analysis\\n${cycleThought}\\n` : '',
            lastResult ? `### Previous Result\n"${lastResult}"\n` : '',
            '',
            '### Guidelines',
            '- Be concise and natural. Do not be overly verbose.',
            '- If the user asked a question, answer it directly.',
            '- If the user gave a greeting, respond warmly.',
            '- If this is a progress update, briefly summarize what was done.',
            '- Do NOT describe what you are going to do — just do it.',
            '- Output ONLY the response text. No prefixes, no JSON, no markdown wrappers.',
        ]
            .filter(Boolean)
            .join('\n');

        const { resolved, message } = await invokeLLM({
            runtime: getConfig() as never,
            messages: [new SystemMessage(systemPrompt)],
            nodeName: 'action_speak',
            graphName: 'ace-v3',
        });

        // Write output & result to thread storage, store pointers on the running action
        const cycleIndex = (state.cycles ?? []).length - 1;
        const runningActionIdx = cycle?.actions?.findIndex(a => a.status === 'running') ?? 0;
        const runningAction = runningActionIdx >= 0 ? cycle?.actions?.[runningActionIdx] : undefined;
        if (runningAction && threadUid) {
            runningAction.output = await writeActionOutput(threadUid, cycleIndex, runningActionIdx, { prompt: systemPrompt }).catch(() => '');
            runningAction.result = await writeActionResult(threadUid, cycleIndex, runningActionIdx, { reply: typeof resolved === 'string' ? resolved : JSON.stringify(resolved) }).catch(() => '');
        }

        const output: Partial<AceAgentV3State> = {
            messages: [message],
            current_cycle: cycle,
            target_node: 'thought',
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
