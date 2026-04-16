/**
 * Interaction Parser Loop Request Orchestration
 *
 * Summary:
 * - builds the composed prompt and opens the gateway stream request
 * - validates gateway availability, SDK config, and per-session abort wiring
 * - finalizes the streaming entry into `continue`, `stop`, `interrupted`, or `error`
 *
 * ASCII Diagram:
 *
 *   prompt
 *     |
 *     v
 *   buildPrompt()
 *     |
 *     v
 *   validate gateway + attach abort controller
 *     |
 *     v
 *   fetch stream -> processGatewayStream()
 *     |
 *     v
 *   finalize entry -> dispatch `continue` or `stop`
 *
 * Notes:
 * - this file owns request-level control flow; it should not parse stream content directly
 */

import { AIBlockLifecycleStatus, AIParserProtocolState, AISessionStatus, type AIEntry, type AISession, type AISessionState, type AITurn } from '#/schemas/ai';
import type { AIGatewayConfig, AIGatewaySDKTarget } from '#/schemas/ai_gateway';
import { AIGatewayEngine } from '#/services/aiGatewayEngine';
import { HealthProbe } from '#/services/aiGateway/healthProbe';
import { buildPrompt, type AIPromptKind } from '#/services/aiGateway/promptBuilder';
import { KernelEngine } from '#/services/kernelEngine';
import { invokeBlockLifecycleHandler } from './blockLifecycle';
import { initializeStreamingEntry, patchCurrentEntryNetworkTrace, persistBlock } from './persistence';
import { AISessionBlockBus, type GatewayTargetConfig } from './shared';
import { processGatewayStream } from './streamProcessor';

export async function sendPromptToGateway(
    prompt: string,
    session_uid: string,
    promptKind: AIPromptKind = 'user_prompt',
    sdk?: string,
    model?: string,
): Promise<void> {
    console.log(`[AIGatewayEngine] Sending ${promptKind} to gateway for session ${session_uid}. Prompt: ${prompt}, SDK: ${sdk}, Model: ${model}`);

    (async () => {
        try {
            await runGatewayStreamRequest(prompt, session_uid, promptKind, sdk, model);
        } catch (error) {
            await failStreamingEntry(session_uid, error);
        }
    })();
}

export function shouldContinueAutonomousLoop(
    sessionState: AISessionState,
    terminalProtocolState?: AIParserProtocolState,
): boolean {
    void sessionState;

    if (terminalProtocolState === AIParserProtocolState.STOP_AND_CONTINUE_LOOP) return true;
    if (
        terminalProtocolState === AIParserProtocolState.STOP_CURRENT_RESPONSE
        || terminalProtocolState === AIParserProtocolState.INTERRUPTED
    ) return false;

    return false;
}

async function runGatewayStreamRequest(
    prompt: string,
    session_uid: string,
    promptKind: AIPromptKind,
    sdk?: string,
    model?: string,
): Promise<void> {
    const composed_prompt = buildPrompt(prompt, session_uid, promptKind);
    initializeStreamingEntry(session_uid, prompt, composed_prompt);

    const { activeGatewayUrl, sdkConfig } = await validateGatewayTarget(session_uid, sdk, model);
    const abortController = attachAbortControllerToSession(session_uid);
    const response = await openGatewayResponseStream(
        activeGatewayUrl,
        session_uid,
        sdkConfig,
        composed_prompt,
        sdk,
        model,
        abortController,
    );

    const terminalProtocolState = await processGatewayStream(session_uid, response.body!.getReader(), abortController);
    finalizeStreamingEntry(session_uid, terminalProtocolState);
}

async function validateGatewayTarget(session_uid: string, sdk?: string, model?: string): Promise<GatewayTargetConfig> {
    const activeGatewayUrl = await HealthProbe.getBaseUrl();

    if (!activeGatewayUrl) {
        AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));
        throw new Error('No healthy gateway instance available');
    }

    if (!sdk || !model) {
        AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));
        throw new Error('SDK and model must be specified to send prompt to gateway');
    }

    const AIGatewayConfig = AIGatewayEngine.getConfig() as AIGatewayConfig;
    // @ts-expect-error
    const sdkConfig = AIGatewayConfig.sdks[sdk];

    if (!sdkConfig?.api_key) {
        AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));
        throw new Error(`${sdk} API key not configured in gateway config`);
    }

    return { activeGatewayUrl, sdkConfig };
}

function attachAbortControllerToSession(session_uid: string): AbortController {
    const abortController = new AbortController();

    KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
        active_abort_controller: abortController,
    } as Partial<AISession>);

    return abortController;
}

async function openGatewayResponseStream(
    activeGatewayUrl: string,
    session_uid: string,
    sdkConfig: AIGatewaySDKTarget,
    composed_prompt: string,
    sdk?: string,
    model?: string,
    abortController?: AbortController,
): Promise<Response> {
    const requestUrl = `${activeGatewayUrl}/chat/${sdk}`;
    const requestStartedAt = Date.now();
    const requestHeaders = {
        Authorization: sanitizeAuthorizationHeader(`Bearer ${sdkConfig.api_key}`),
        'Content-Type': 'application/json',
    };
    const requestBody = { model, prompt: composed_prompt };

    patchCurrentEntryNetworkTrace(session_uid, {
        request: {
            at: requestStartedAt,
            method: 'POST',
            url: requestUrl,
            headers: requestHeaders,
            body: requestBody,
        },
        response: {
            lifecycle: 'pending',
        },
    });

    const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${sdkConfig.api_key}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, prompt: composed_prompt }),
        signal: abortController?.signal,
    });

    const responseHeaders = serializeHeaders(response.headers);
    patchCurrentEntryNetworkTrace(session_uid, {
        response: {
            at: Date.now(),
            status: response.status,
            status_text: response.statusText,
            ok: response.ok,
            headers: responseHeaders,
            lifecycle: response.ok && response.body ? 'streaming' : 'failed',
        },
    });

    if (!response.ok || !response.body) {
        const errorText = await response.text().catch(() => '');
        patchCurrentEntryNetworkTrace(session_uid, {
            response: {
                completed_at: Date.now(),
                duration_ms: Date.now() - requestStartedAt,
                body_preview: errorText.slice(0, 4000),
                lifecycle: 'failed',
                error_message: `Response failed: ${response.statusText}`,
            },
        });
        AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));
        throw new Error(`Response failed: ${response.statusText}`);
    }

    return response;
}

function finalizeStreamingEntry(session_uid: string, terminalProtocolState?: AIParserProtocolState): void {
    const currentSessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
    const currentTurn = currentSessionState.turns?.[currentSessionState.turn_index];
    const currentEntry = currentTurn.entries?.[currentTurn.active_entry_index as number] as AIEntry;

    currentEntry.status = 'completed';
    if (currentEntry.network_trace?.response) {
        const completedAt = Date.now();
        currentEntry.network_trace.response.completed_at = completedAt;
        currentEntry.network_trace.response.lifecycle = 'completed';
        currentEntry.network_trace.response.streamed_char_count = currentEntry.response.length;
        if (currentEntry.network_trace.request?.at) {
            currentEntry.network_trace.response.duration_ms = completedAt - currentEntry.network_trace.request.at;
        }
    }

    KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
        ...currentSessionState,
        turns: [
            ...currentSessionState.turns.slice(0, currentSessionState.turn_index),
            {
                ...currentTurn, entries: [
                    ...currentTurn.entries.slice(0, currentTurn.active_entry_index as number),
                    { ...currentEntry },
                ],
            },
        ],
    });

    const updatedState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
    const shouldContinue = shouldContinueAutonomousLoop(updatedState.state, terminalProtocolState);

    if (shouldContinue) {
        KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
            autonomous_follow_up_loop_status: 'active',
        } as Partial<AISession>);
        AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'continue' }));
    } else {
        KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
            autonomous_follow_up_loop_status: terminalProtocolState === AIParserProtocolState.INTERRUPTED ? 'interrupted' : 'completed',
        } as Partial<AISession>);
        AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));
    }
}

async function failStreamingEntry(session_uid: string, error: unknown): Promise<void> {
    AISessionBlockBus.dispatchEvent(new CustomEvent(`system:ai_session:${session_uid}:response`, { detail: 'stop' }));

    const currentSessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISession;
    const isInterrupted = currentSessionState?.termination_requested === true
        || (error instanceof Error && error.name === 'AbortError');
    const currentTurn = currentSessionState.turns?.[currentSessionState.turn_index] as AITurn;
    const currentEntry = currentTurn.entries?.[currentTurn.active_entry_index as number] as AIEntry;

    const unfinishedBlock = [...(currentEntry.blocks ?? [])].reverse().find((block) => (
        block.lifecycle_status === AIBlockLifecycleStatus.STARTED
        || block.lifecycle_status === AIBlockLifecycleStatus.STREAMING
    ));

    if (unfinishedBlock && currentSessionState.active_abort_controller) {
        unfinishedBlock.lifecycle_status = AIBlockLifecycleStatus.ABORTED;
        unfinishedBlock.aborted_at = Date.now();
        unfinishedBlock.updated_at = unfinishedBlock.aborted_at;
        unfinishedBlock.runtime_context = {
            ...(unfinishedBlock.runtime_context ?? {}),
            abort_reason: error instanceof Error ? error.message : String(error),
        };
        persistBlock(session_uid, unfinishedBlock);
        await invokeBlockLifecycleHandler(session_uid, unfinishedBlock, 'abort', currentSessionState.active_abort_controller);
    }

    console.log(currentSessionState);
    currentEntry.status = isInterrupted ? 'interrupted' : 'error';
    if (currentEntry.network_trace?.response) {
        const completedAt = Date.now();
        currentEntry.network_trace.response.completed_at = completedAt;
        currentEntry.network_trace.response.lifecycle = isInterrupted ? 'aborted' : 'failed';
        currentEntry.network_trace.response.streamed_char_count = currentEntry.response.length;
        currentEntry.network_trace.response.error_message = error instanceof Error ? error.message : String(error);
        if (currentEntry.network_trace.request?.at) {
            currentEntry.network_trace.response.duration_ms = completedAt - currentEntry.network_trace.request.at;
        }
    }

    KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
        ...currentSessionState,
        turns: [
            ...currentSessionState.turns.slice(0, currentSessionState.turn_index),
            {
                ...currentTurn, entries: [
                    ...currentTurn.entries.slice(0, currentTurn.active_entry_index as number),
                    { ...currentEntry },
                ],
            },
        ],
    });

    if (isInterrupted) {
        KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
            autonomous_follow_up_loop_status: 'interrupted',
            active_abort_controller: undefined,
            termination_requested: false,
        } as Partial<AISession>);
        return;
    }

    KernelEngine.updateMemory(`system:ai_session:${session_uid}:state`, {
        status: AISessionStatus.ERROR,
        active_abort_controller: undefined,
        error_payload: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
    } as Partial<AISession>);
}

function sanitizeAuthorizationHeader(value: string): string {
    const trimmed = value.trim();
    if (trimmed === '') return trimmed;

    const [scheme, token] = trimmed.split(/\s+/, 2);
    if (!token) return `${scheme} ***`;
    const visibleTail = token.slice(-4);
    return `${scheme} ***${visibleTail}`;
}

function serializeHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
        result[key] = value;
    });
    return result;
}