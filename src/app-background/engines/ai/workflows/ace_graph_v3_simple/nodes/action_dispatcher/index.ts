/**
 * Action Dispatcher — iterates through a cycle's batched actions.
 *
 * Flow:
 *   thought → dispatcher → action_speak → dispatcher → action_context → dispatcher → thought
 *
 * Logic:
 *   1. Mark any currently "running" action as "done" (just returned).
 *   2. Find next "pending" action — mark it "running", route to it.
 *   3. No more pending → all done, invoke LLM for result_summary, then route to thought.
 */

import { SystemMessage } from '@langchain/core/messages';
import { Command, getConfig } from '@langchain/langgraph';
import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
import { emitNodeStart, emitNodeEnd } from '#/app-background/lib/utils/ai/emit-graph-event';
import { readActionResult, readActionOutput } from '#/app-background/lib/utils/thread-storage';
import type { AceAgentV3State } from '../../types';

const TARGET_MAP: Record<string, string> = {
    action_speak: 'action_speak',
    action_tool: 'action_tool',
    action_memory: 'action_memory',
    action_mcp: 'action_mcp',
    action_write_file: 'action_write_file',
    action_shell: 'action_shell',
    action_read_file: 'action_read_file',
    action_step: 'action_step',
    end: 'action_end',
};

export function createActionDispatcher() {
    return async function actionDispatcher(
        state: AceAgentV3State,
    ): Promise<Partial<AceAgentV3State> | Command> {
        const config = getConfig();
        const threadUid = (config as any)?.configurable?.thread_id;
        if (threadUid) emitNodeStart(threadUid, 'action_dispatcher', 'ace-v3', state).catch(() => {});

        const cycle = state.current_cycle;
        if (!cycle || !cycle.actions || cycle.actions.length === 0) {
            return { target_node: 'thought', from_node: 'action_dispatcher' };
        }

        // Phase 1: Mark any running action as done (just returned from execution)
        const running = cycle.actions.find(a => a.status === 'running');
        if (running) {
            running.status = 'done';
        }

        // Phase 2: Find next pending action
        const next = cycle.actions.find(a => a.status === 'pending');
        if (!next) {
            // All done — summarize results before routing to thought
            const doneActions = cycle.actions.filter(a => a.status === 'done');

            if (doneActions.length > 0) {
                try {
                    // Read results from file pointers — let errors throw to recovery_error
                    const actionDetails = await Promise.all(
                        doneActions.map(async (a, i) => {
                            const outputPath = a.output as string | undefined;
                            const resultPath = a.result as string | undefined;

                            const outputData = outputPath
                                ? await (async () => {
                                      try {
                                          const d = await readActionOutput(outputPath!);
                                          return d ? JSON.stringify(d).slice(0, 200) : 'no output';
                                      } catch {
                                          return 'output unavailable';
                                      }
                                  })()
                                : 'no output';

                            const resultData = resultPath
                                ? await (async () => {
                                      try {
                                          const d = await readActionResult(resultPath!);
                                          return d ? JSON.stringify(d).slice(0, 200) : 'no result';
                                      } catch {
                                          return 'result unavailable';
                                      }
                                  })()
                                : 'no result';

                            return {
                                index: i + 1,
                                action: a.target.name,
                                reason: (a.target.reason ?? '').slice(0, 100),
                                output: outputData,
                                result: resultData,
                            };
                        }),
                    );

                    // Build structured review prompt with example
                    const actionList = actionDetails
                        .map(a =>
                            [
                                `Action (${a.index}):`,
                                `  target: ${a.action}`,
                                `  reason: ${a.reason}`,
                                `  output: ${a.output}`,
                                `  result: ${a.result}`,
                            ].join('\n'),
                        )
                        .join('\n\n');

                    const summaryPrompt = [
                        'You are reviewing the results of actions executed in one cycle.',
                        'Below are ALL actions from this cycle with their output and result.',
                        '',
                        '### Actions Executed',
                        actionList,
                        '',
                        '### Instructions',
                        'Write a 2-4 sentence review summary that covers ALL actions in sequence.',
                        'For EACH action, mention whether it succeeded or failed.',
                        'If any action failed, note why and what should be tried next.',
                        'Be specific — reference actual output/result data.',
                        'Connect the actions: if Action (1) created X and Action (2) used X, say so.',
                        '',
                        '### Example Format',
                        '"Action (1) read the config file successfully, finding 3 keys. Action (2) then used those keys to generate a response — completed. Overall: all actions succeeded and the user request was addressed."',
                        '',
                        '### Rules',
                        '- Use plain text only (no HTML, no markdown).',
                        '- Keep it concise (max 4 sentences).',
                        '- Always mention action count: "Action (1) ..., Action (2) ...".',
                    ].join('\n');

                    const { resolved } = await invokeLLM({
                        runtime: config as never,
                        messages: [new SystemMessage(summaryPrompt)],
                        nodeName: 'action_dispatcher',
                        graphName: 'ace-v3',
                        maxRetries: 0,
                        timeout: 8000,
                        streaming: false,
                    });

                    cycle.result_summary = typeof resolved === 'string'
                        ? resolved.trim()
                        : (resolved && typeof resolved === 'object'
                            ? JSON.stringify(resolved)
                            : `${doneActions.length} action(s) completed.`);

                    // Fallback if LLM returns empty
                    if (!cycle.result_summary) {
                        cycle.result_summary = actionDetails
                            .map(a => `Action (${a.index}): ${a.action} → ${a.result}`)
                            .join(' | ');
                    }
                } catch {
                    cycle.result_summary = `${doneActions.length} action(s) completed.`;
                }
            }

            const output: Partial<AceAgentV3State> = {
                current_cycle: cycle,
                target_node: 'thought',
                from_node: 'action_dispatcher',
            };

            if (threadUid)
                emitNodeEnd(threadUid, 'action_dispatcher', 'ace-v3', output, {
                    allDone: true,
                }).catch(() => {});

            return output;
        }

        // Mark as running and route
        next.status = 'running';
        const actionNode = TARGET_MAP[next.target.name] ?? 'action_speak';

        const output: Partial<AceAgentV3State> = {
            current_cycle: cycle,
            target_node: actionNode,
            target_node_reason: next.target.reason,
            from_node: 'action_dispatcher',
        };

        if (threadUid)
            emitNodeEnd(threadUid, 'action_dispatcher', 'ace-v3', output, {
                action: next.target.name,
                remaining: cycle.actions.filter(a => a.status === 'pending').length,
            }).catch(() => {});

        return output;
    };
}
