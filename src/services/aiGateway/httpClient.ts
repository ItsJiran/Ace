import { KernelEngine } from '../kernelEngine';
import { handleSessionStreamChunk } from './streamHandler';
import { PROCESS_KIND } from '#/schemas/process';
import { AI_GATEWAY_PROCESS_TYPE, AI_RESPONSE_STATUS, AI_SESSION_STATUS } from './types';
import type { AISession } from './types';
import type { AIGatewayConfig } from '../../schemas/ai_gateway';

export interface SendSessionStreamResult {
    interrupted: boolean;
    interruptReason?: string;
}

/**
 * Sends a prompt to the gateway server for a specific session and streams the
 * response token-by-token into RAM via handleSessionStreamChunk.
 *
 * @param session           The active session object (mutated for status tracking).
 * @param prompt            Final composed prompt to send to the gateway.
 * @param replyToRamKey     RAM key where the response is written.
 * @param gatewayConfig     Current gateway config (used to look up API key).
 * @param ensureGatewayServerUrl  Callback to resolve (or rediscover) the gateway base URL.
 */
export async function sendToSession(
    session: AISession,
    prompt: string,
    replyToRamKey: string,
    gatewayConfig: AIGatewayConfig,
    ensureGatewayServerUrl: () => Promise<string | null>,
    metadata?: {
        original_prompt?: string;
        used_contexts?: unknown[];
        prompt_reference?: { ref_uid: string; storage_key: string };
        response_reference?: { ref_uid: string; storage_key: string };
        prompt_turn_id?: string;
        response_attempt_index?: number;
        response_turns_seed?: unknown[];
        process_uid?: string;
    },
): Promise<SendSessionStreamResult> {
    console.log(`[AIGatewayEngine] [${session.sessionId}] Sending: "${prompt}"`);
    session.termination_requested = false;
    session.status = AI_SESSION_STATUS.STREAMING;
    session.activeOutputRamKey = replyToRamKey;

    // ── PRE-ALLOCATION: write empty placeholder so subscribers see 'streaming' ──
    const createPayload = {
        original_prompt: metadata?.original_prompt ?? prompt,
        prompt: metadata?.original_prompt ?? prompt,
        composed_prompt: prompt,
        used_contexts: metadata?.used_contexts ?? [],
        prompt_reference: metadata?.prompt_reference,
        response_reference: metadata?.response_reference,
        text: '',
        raw_response: '',
        blocks: [],
        protocol_validation: session.currentProtocolState ?? null,
        parser_batches: [],
        parser_batch_count: 0,
        events_total: 0,
        status: AI_RESPONSE_STATUS.STREAMING,
        session_id: session.sessionId,
        response_turns: Array.isArray(metadata?.response_turns_seed) ? metadata.response_turns_seed : [],
        active_response_turn_id: metadata?.prompt_turn_id,
        active_response_attempt_index: metadata?.response_attempt_index,
        started_at: Date.now(),
    };

    const ownerProcessUid = typeof metadata?.process_uid === 'string' ? metadata.process_uid : undefined;

    const updateResponseMemory = (payload: Record<string, unknown>) => {
        const updated = ownerProcessUid
            ? KernelEngine.updateRuntimeMemory({
                owner_process_uid: ownerProcessUid,
                memory_uid: replyToRamKey,
                payload,
            })
            : false;
        if (!updated) {
            KernelEngine.updateMemory(replyToRamKey, payload);
        }
    };

    // Commit initial payload to the pre-allocated turn memory
    updateResponseMemory(createPayload);

    const sdkConfig = gatewayConfig.sdks[session.sdk];
    if (!sdkConfig?.api_key) {
        updateResponseMemory({
            status: AI_RESPONSE_STATUS.ERROR,
            error_message: `${session.sdk} API key not configured.`,
            finished_at: Date.now(),
        });
        session.status = AI_SESSION_STATUS.CONNECTED;
        return {
            interrupted: false,
        };
    }

    const baseUrl = await ensureGatewayServerUrl();
    if (!baseUrl) {
        updateResponseMemory({
            status: AI_RESPONSE_STATUS.ERROR,
            error_message: 'Gateway server not reachable. Please start the gateway sidecar.',
            finished_at: Date.now(),
        });
        session.status = AI_SESSION_STATUS.CONNECTED;
        return {
            interrupted: false,
        };
    }

    try {
        const abortController = new AbortController();
        session.activeAbortController = abortController;

        const response = await fetch(`${baseUrl}/chat/${session.sdk}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${sdkConfig.api_key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ model: session.model, prompt }),
            signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
            const errorText = await response.text();
            updateResponseMemory({
                status: AI_RESPONSE_STATUS.ERROR,
                error_message: `Gateway error ${response.status}: ${errorText}`,
                finished_at: Date.now(),
            });
            session.status = AI_SESSION_STATUS.CONNECTED;
            return {
                interrupted: false,
            };
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        const parserProcessUid = ownerProcessUid
            ? KernelEngine.spawnSubprocess(ownerProcessUid, AI_GATEWAY_PROCESS_TYPE.PARSER_STREAM, {
                metadata: {
                    session_id: session.sessionId,
                    reply_to_ram_key: replyToRamKey,
                },
                process_kind: PROCESS_KIND.AI_BLOCK,
                owner_engine: 'aiGatewayEngine',
            }).process_uid
            : undefined;

        if (parserProcessUid) {
            KernelEngine.updateProcessStatus(parserProcessUid, 'running');
        }

        const closeParserProcess = (state: 'done' | 'failed') => {
            if (!parserProcessUid) return;
            KernelEngine.updateProcessStatus(parserProcessUid, state);
        };

        let interrupted = false;
        let interruptReason: string | undefined;
        let ignoreLateChunks = false;
        let ignoredChunkCount = 0;
        let ignoredByteCount = 0;

        while (true) {
            if (session.termination_requested) {
                interrupted = true;
                interruptReason = 'terminated_by_process';
                ignoreLateChunks = true;
                await reader.cancel();
                continue;
            }

            const { done, value } = await reader.read();
            if (done) {
                if (session.activeEventBuffer) {
                    const finalOutcome = handleSessionStreamChunk(
                        session,
                        '',
                        replyToRamKey,
                        parserProcessUid ?? ownerProcessUid,
                        metadata?.prompt_turn_id,
                        true,
                    );
                    if (finalOutcome.interrupted) {
                        interrupted = true;
                        interruptReason = finalOutcome.reason;
                    }
                }
                break;
            }
            if (!value) continue;

            if (ignoreLateChunks) {
                ignoredChunkCount += 1;
                ignoredByteCount += value.byteLength;
                continue;
            }

            const chunk = decoder.decode(value, { stream: true });
            const parseOutcome = handleSessionStreamChunk(
                session,
                chunk,
                replyToRamKey,
                parserProcessUid ?? ownerProcessUid,
                metadata?.prompt_turn_id,
                false,
            );
            if (parseOutcome.interrupted) {
                interrupted = true;
                interruptReason = parseOutcome.reason;
                ignoreLateChunks = true;
                await reader.cancel();
                continue;
            }

            // per-chunk progress is tracked by the memory update, not process payload
        }

        if (interrupted) {
            closeParserProcess('done');
            session.status = AI_SESSION_STATUS.CONNECTED;
            session.activeAbortController = undefined;
            session.termination_requested = false;
            updateResponseMemory({
                status: AI_RESPONSE_STATUS.INTERRUPTED,
                parser_interrupt_reason: interruptReason ?? 'parser_interrupt_requested',
                ignored_after_interrupt_chunks: ignoredChunkCount,
                ignored_after_interrupt_bytes: ignoredByteCount,
                finished_at: Date.now(),
            });
            return {
                interrupted: true,
                interruptReason: interruptReason ?? 'parser_interrupt_requested',
            };
        }

        closeParserProcess('done');
    } catch (error) {
        const maybeAbortError =
            (error instanceof DOMException && error.name === 'AbortError')
            || String(error).toLowerCase().includes('abort');
        if (session.termination_requested || maybeAbortError) {
            session.status = AI_SESSION_STATUS.CONNECTED;
            session.activeAbortController = undefined;
            session.termination_requested = false;
            updateResponseMemory({
                status: AI_RESPONSE_STATUS.INTERRUPTED,
                parser_interrupt_reason: 'terminated_by_process',
                finished_at: Date.now(),
            });
            return {
                interrupted: true,
                interruptReason: 'terminated_by_process',
            };
        }

        if (ownerProcessUid) {
            // parser process may not exist for pre-fetch failures; this is safe no-op if missing.
            const parserCandidates = KernelEngine.getAllProcesses()
                .filter((record) => record.parent_process_uid === ownerProcessUid && record.type === AI_GATEWAY_PROCESS_TYPE.PARSER_STREAM)
                .sort((a, b) => b.updated_at - a.updated_at);
            const latestParser = parserCandidates[0];
            if (latestParser?.process_uid) {
                KernelEngine.updateProcessStatus(latestParser.process_uid, 'failed');
            }
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        updateResponseMemory({
            status: AI_RESPONSE_STATUS.ERROR,
            error_message: errorMessage,
            finished_at: Date.now(),
        });
        session.status = AI_SESSION_STATUS.CONNECTED;
        session.activeAbortController = undefined;
        session.termination_requested = false;
        return {
            interrupted: false,
        };
    }

    // ── FINALIZE ─────────────────────────────────────────────────────────────
    session.status = AI_SESSION_STATUS.CONNECTED;
    session.activeAbortController = undefined;
    session.termination_requested = false;
    updateResponseMemory({ status: AI_RESPONSE_STATUS.COMPLETED, finished_at: Date.now() });

    return {
        interrupted: false,
    };
}
