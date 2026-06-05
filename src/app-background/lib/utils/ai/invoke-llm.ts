/**
 * LLM Invoke Wrapper — wraps mainModel with:
 * 1. Lifecycle events (llm-call-start / llm-call-end / llm-call-retry)
 * 2. Automatic retry on parse/format errors with error feedback to the model
 *
 * Usage (replaces manual mainModel + model.invoke):
 *
 *   import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
 *
 *   const result = await invokeLLM({
 *       runtime: getConfig() as never,
 *       structuredOutput: MySchema,
 *       messages: [new SystemMessage('...')],
 *       nodeName: 'review_task',
 *       graphName: 'ace-v2',
 *   });
 */

import { SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { z } from 'zod';
import mainModel from '#/app-background/engines/ai/models/main_model';
import { emitLLMStart, emitLLMEnd, emitLLMRetry } from './emit-graph-event';
import type { AgentConfigType } from '#/shared/schemas/ai';

// ── Types ──────────────────────────────────────────────────────────────────

interface InvokeLLMBase {
    /** LangGraph runtime config (from getConfig()). */
    runtime: AgentConfigType;
    /** Messages to send to the model. */
    messages: BaseMessage[];
    /** Node name for event tracing. */
    nodeName: string;
    /** Graph name for event tracing. */
    graphName: string;
    /** Max retries on parse/format errors (default 2). */
    maxRetries?: number;
}

interface InvokeLLMStructured extends InvokeLLMBase {
    structuredOutput: z.ZodType<any>;
    tools?: never;
}

interface InvokeLLMTools extends InvokeLLMBase {
    structuredOutput?: never;
    tools: Array<{ type: string; [key: string]: unknown }>;
}

interface InvokeLLMPlain extends InvokeLLMBase {
    structuredOutput?: never;
    tools?: never;
}

export type InvokeLLMOptions = InvokeLLMStructured | InvokeLLMTools | InvokeLLMPlain;

// ── Implementation ─────────────────────────────────────────────────────────

function promptPreview(messages: BaseMessage[]): string {
    const first = messages[0];
    if (!first) return '(empty)';
    const text = typeof first.content === 'string' ? first.content : JSON.stringify(first.content);
    return text.slice(0, 200);
}

export async function invokeLLM(options: InvokeLLMOptions): Promise<any> {
    const MAX_RETRIES = options.maxRetries ?? 2;
    const threadUid = (options.runtime as any)?.configurable?.thread_id ?? 'unknown';
    const hasStructuredOutput = !!(options as InvokeLLMStructured).structuredOutput;

    let messages = [...options.messages];
    let attempt = 0;

    while (true) {
        attempt++;

        emitLLMStart(threadUid, options.nodeName, options.graphName, {
            attempt,
            messageCount: messages.length,
            hasStructuredOutput,
            promptPreview: promptPreview(messages),
        }).catch(() => {});

        try {
            const model = await mainModel({
                runtime: options.runtime,
                structuredOutput: (options as InvokeLLMStructured).structuredOutput,
                tools: (options as InvokeLLMTools).tools,
            });

            const startTime = Date.now();
            const result = await model.invoke(messages);
            const durationMs = Date.now() - startTime;

            const resultPreview = typeof result === 'string'
                ? result.slice(0, 200)
                : JSON.stringify(result).slice(0, 200);

            emitLLMEnd(threadUid, options.nodeName, options.graphName, {
                attempt,
                durationMs,
                resultPreview,
            }).catch(() => {});

            return result;
        } catch (error: any) {
            if (attempt > MAX_RETRIES) throw error;

            const errorMsg = error?.message ?? String(error);

            emitLLMRetry(threadUid, options.nodeName, options.graphName, {
                attempt,
                maxRetries: MAX_RETRIES,
                error: errorMsg.slice(0, 300),
            }).catch(() => {});

            // Feed error back so the model can self-correct its output format
            if (hasStructuredOutput) {
                messages = [
                    ...messages,
                    new SystemMessage(
                        [
                            'Your previous response caused a parsing/format error.',
                            `Error: ${errorMsg}`,
                            'Please fix the output format and follow the expected schema exactly.',
                        ].join('\n'),
                    ),
                ];
            }
        }
    }
}
