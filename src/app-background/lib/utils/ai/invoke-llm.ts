/**
 * LLM Invoke Wrapper — wraps mainModel with:
 * 1. XML prompt injection (buildXmlPromptMessage) for structured output
 * 2. Plain model call (no .withStructuredOutput / tool_calls)
 * 3. Manual XML parsing + Zod validation (parseXmlOutput)
 * 4. Automatic retry with error feedback on parse failure
 *
 * Usage:
 *
 *   import { invokeLLM } from '#/app-background/lib/utils/ai/invoke-llm';
 *
 *   const result = await invokeLLM({
 *       runtime: getConfig() as never,
 *       structuredOutput: ThoughtAction,
 *       messages: [new SystemMessage('...')],
 *       nodeName: 'thought',
 *       graphName: 'ace-v3',
 *   });
 *   // result → { thought: '...', action_type: 'action_speak', action_reason: '...' }
 */

import { SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { z } from 'zod';
import mainModel from '#/app-background/engines/ai/models/main_model';
import { emitLLMStart, emitLLMEnd, emitLLMRetry } from './emit-graph-event';
import type { AgentConfigType } from '#/shared/schemas/ai';
import { buildXmlPromptMessage } from './prompt-structured-output';
import { parseXmlOutput } from '#/shared/lib/parse-structured-output';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Extract text content from a settled AIMessage (handles content blocks). */
function extractTextContent(result: unknown): string {
    const msg = result as any;
    if (!msg) return '';
    const content = msg.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        const parts: string[] = [];
        for (const block of content) {
            if (block?.type === 'text' && typeof block.text === 'string') {
                parts.push(block.text);
            }
        }
        if (parts.length > 0) return parts.join('\n');
    }
    return JSON.stringify(result);
}

// ── Types ──────────────────────────────────────────────────────────────────

interface InvokeLLMBase {
    runtime: AgentConfigType;
    messages: BaseMessage[];
    nodeName: string;
    graphName: string;
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

export async function invokeLLM(options: InvokeLLMOptions): Promise<any> {
    const MAX_RETRIES = options.maxRetries ?? 2;
    const threadUid = (options.runtime as any)?.configurable?.thread_id ?? 'unknown';
    const hasStructuredOutput = !!(options as InvokeLLMStructured).structuredOutput;
    const schema = (options as InvokeLLMStructured).structuredOutput;

    // Build XML format prompt if structured output is requested
    const xmlPromptMsg = hasStructuredOutput ? buildXmlPromptMessage(schema) : null;

    let messages = [...options.messages];
    let attempt = 0;

    while (true) {
        attempt++;

        // Prepend XML format instructions so the model knows to output XML
        const callMessages = xmlPromptMsg
            ? [xmlPromptMsg, ...messages]
            : messages;

        emitLLMStart(threadUid, options.nodeName, options.graphName, {
            attempt,
            messageCount: callMessages.length,
            hasStructuredOutput,
            promptPreview: callMessages[0]?.content?.toString(),
        }).catch(() => {});

        try {
            // Call mainModel as PLAIN — never pass structuredOutput
            const toolsOption = (options as InvokeLLMTools).tools;
            const model = await mainModel({
                runtime: options.runtime,
                ...(toolsOption ? { tools: toolsOption } : {}),
            });

            const startTime = Date.now();
            const result = await model.invoke(callMessages);
            const durationMs = Date.now() - startTime;

            // If plain (no structured output), return content as-is
            if (!hasStructuredOutput) {
                const resolved = (result as any)?.content ?? result;
                emitLLMEnd(threadUid, options.nodeName, options.graphName, {
                    attempt,
                    durationMs,
                    resultPreview: typeof resolved === 'string' ? resolved : JSON.stringify(resolved),
                }).catch(() => {});
                return resolved;
            }

            // ── Parse XML structured output ──
            const rawText = extractTextContent(result);

            console.log(`[invokeLLM] raw XML (${options.nodeName}):`, rawText.slice(0, 300));

            const parsed = parseXmlOutput(rawText, schema);

            if (!parsed.success) {
                const errorMsg = parsed.error;
                console.error(`[invokeLLM] XML parse failed (${options.nodeName}):`, errorMsg);

                emitLLMEnd(threadUid, options.nodeName, options.graphName, {
                    attempt,
                    durationMs,
                    resultPreview: `[PARSE ERROR] ${errorMsg}`,
                }).catch(() => {});

                // Retry with error feedback
                if (attempt <= MAX_RETRIES) {
                    messages = [
                        ...messages,
                        new SystemMessage(
                            [
                                'Your previous response could not be parsed as valid XML.',
                                `Error: ${errorMsg}`,
                                '',
                                'Please fix the format. Remember:',
                                '- Output ONLY the XML — no markdown fences, no extra text.',
                                '- Use the exact element names from the template.',
                                '- Every required element must be present.',
                            ].join('\n'),
                        ),
                    ];
                }

                if (attempt > MAX_RETRIES) {
                    throw new Error(`XML structured output failed after ${attempt} attempts: ${errorMsg}`);
                }

                await new Promise((r) => setTimeout(r, 500));
                continue;
            }

            // Success
            const resolved = parsed.data;
            emitLLMEnd(threadUid, options.nodeName, options.graphName, {
                attempt,
                durationMs,
                resultPreview: JSON.stringify(resolved),
            }).catch(() => {});

            return resolved;
        } catch (error: any) {
            if (attempt > MAX_RETRIES) throw error;

            emitLLMRetry(threadUid, options.nodeName, options.graphName, {
                attempt,
                maxRetries: MAX_RETRIES,
                error: (error?.message ?? String(error)).slice(0, 300),
            }).catch(() => {});

            throw error;
        }
    }
}
