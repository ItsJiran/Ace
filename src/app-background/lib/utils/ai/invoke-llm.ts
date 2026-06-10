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
import { NetworkLLMError, ParsingXMLError, APIKeyNotResolvedError } from '#/shared/lib/agent-errors';

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
    /** Max retries on parse failure. Default 2. Set 0 for no retries. */
    maxRetries?: number;
    /** Timeout in ms for the LLM call. */
    timeout?: number;
    /** Whether to stream the response (default false = invoke). */
    streaming?: boolean;
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
    const TIMEOUT_MS = options.timeout ?? 10000;           // 0 = no timeout
    const STREAMING = options.streaming ?? false;
    const threadUid = (options.runtime as any)?.configurable?.thread_id ?? 'unknown';
    const hasStructuredOutput = !!(options as InvokeLLMStructured).structuredOutput;
    const schema = (options as InvokeLLMStructured).structuredOutput;

    let messages = [...options.messages];
    let attempt = 0;

    // Append XML format to the last system message so it's ONE coherent prompt
    if (hasStructuredOutput && messages.length > 0) {
        const last = messages[messages.length - 1];
        if (typeof last.content === 'string') {
            const xmlText = typeof buildXmlPromptMessage(schema).content === 'string'
                ? buildXmlPromptMessage(schema).content as string
                : '';
            messages[messages.length - 1] = new SystemMessage(
                `${last.content}\n\n${xmlText}`,
            );
        }
    }

    while (true) {
        attempt++;

        // Extract AbortSignal from LangGraph config so LLM calls respect cancellation
        const configSignal = (options.runtime as any)?.signal as AbortSignal | undefined;

        // Combine config signal with timeout signal
        let signal: AbortSignal | undefined = configSignal;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        if (TIMEOUT_MS > 0) {
            const timeoutCtrl = new AbortController();
            timeoutId = setTimeout(() => timeoutCtrl.abort(), TIMEOUT_MS);
            // If there's also a config signal, combine: abort on whichever fires first
            if (configSignal) {
                const combined = new AbortController();
                const onAbort = () => combined.abort();
                configSignal.addEventListener('abort', onAbort, { once: true });
                timeoutCtrl.signal.addEventListener('abort', onAbort, { once: true });
                signal = combined.signal;
            } else {
                signal = timeoutCtrl.signal;
            }
        }

        emitLLMStart(threadUid, options.nodeName, options.graphName, {
            attempt,
            messageCount: messages.length,
            hasStructuredOutput,
            promptPreview: messages[0]?.content?.toString(),
        }).catch(() => {});
        try {
            // Call mainModel as PLAIN — never pass structuredOutput
            const toolsOption = (options as InvokeLLMTools).tools;
            const model = await mainModel({
                runtime: options.runtime,
                ...(toolsOption ? { tools: toolsOption } : {}),
            });

            const startTime = Date.now();
            const result = STREAMING
                ? await model.stream(messages, signal ? { signal } : {})
                : await model.invoke(messages, signal ? { signal } : {});
            const durationMs = Date.now() - startTime;

            // Clear timeout if it hasn't fired yet
            if (timeoutId) clearTimeout(timeoutId);

            // ── Streaming path (no structured output) ──
            if (STREAMING) {
                // Structured output + streaming not supported — structured needs full XML
                if (hasStructuredOutput) {
                    throw new Error('Streaming is not supported with structuredOutput. Set streaming: false.');
                }

                emitLLMEnd(threadUid, options.nodeName, options.graphName, {
                    attempt,
                    durationMs,
                    resultPreview: '[stream]',
                }).catch(() => {});

                // Return the async iterable directly — caller consumes it
                return { resolved: null, message: result, stream: result };
            }

            // ── Non-streaming path ──
            // If plain (no structured output), return content as-is
            if (!hasStructuredOutput) {
                const resolved = (result as any)?.content ?? result;
                
                emitLLMEnd(threadUid, options.nodeName, options.graphName, {
                    attempt,
                    durationMs,
                    resultPreview: typeof resolved === 'string' ? resolved : JSON.stringify(resolved),
                }).catch(() => {});

                return {resolved : resolved, message: result};
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
                    throw new ParsingXMLError(
                        `XML structured output failed after ${attempt} attempts: ${errorMsg}`,
                        options.nodeName,
                    );
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

            return {resolved : resolved, message: result};
        } catch (error: any) {
            // Re-throw already typed errors as-is
            if (error instanceof ParsingXMLError) throw error;

            // Detect API key not resolved / auth failures
            const isApiKeyError =
                error?.status === 401 ||
                error?.status === 403 ||
                error?.message?.includes('Invalid API key') ||
                error?.message?.includes('Incorrect API key') ||
                error?.message?.includes('API key not') ||
                error?.message?.includes('authentication') ||
                error?.message?.includes('not authorized') ||
                error?.message?.includes('No API key');

            if (isApiKeyError) {
                throw new APIKeyNotResolvedError(
                    error?.message ?? 'API key is not configured or invalid. Please set it in Settings.',
                    options.nodeName,
                );
            }

            // Detect network / LLM connectivity errors
            const isNetworkError =
                error?.name === 'AbortError' ||
                error?.message?.includes('fetch failed') ||
                error?.message?.includes('ECONNREFUSED') ||
                error?.message?.includes('ETIMEDOUT') ||
                error?.message?.includes('ENOTFOUND') ||
                error?.message?.includes('network') ||
                error?.message?.includes('timeout') ||
                error?.message?.includes('rate_limit') ||
                error?.status === 429 ||
                error?.status === 502 ||
                error?.status === 503;

            if (isNetworkError) {
                throw new NetworkLLMError(
                    error?.message ?? String(error),
                    options.nodeName,
                );
            }

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
