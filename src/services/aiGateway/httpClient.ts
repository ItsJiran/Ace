import { StorageEngine } from '../storageEngine';
import { ProcessEngine } from '../processEngine';
import { handleSessionStreamChunk } from './streamHandler';
import type { AISession } from './types';
import type { AIGatewayConfig } from '../../schemas/ai_gateway';

const CLASSIFICATIONS: string[] = ['system:dev', 'system:ai_parser'];

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
    session.status = 'streaming';
    session.activeOutputRamKey = replyToRamKey;

    // ── PRE-ALLOCATION: write empty placeholder so subscribers see 'streaming' ──
    const createPayload = {
        original_prompt: metadata?.original_prompt ?? prompt,
        prompt,
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
        status: 'streaming',
        session_id: session.sessionId,
        response_turns: Array.isArray(metadata?.response_turns_seed) ? metadata.response_turns_seed : [],
        active_response_turn_id: metadata?.prompt_turn_id,
        active_response_attempt_index: metadata?.response_attempt_index,
        started_at: Date.now(),
    };

    const ownerProcessUid = typeof metadata?.process_uid === 'string' ? metadata.process_uid : undefined;
    const createdByProcess = ownerProcessUid
        ? ProcessEngine.createRuntimeMemory({
            owner_process_uid: ownerProcessUid,
            owner_session_id: session.sessionId,
            memory_uid: replyToRamKey,
            parent_memory_uid: `system:session:${session.sessionId}:context`,
            payload: createPayload,
            classifications: CLASSIFICATIONS,
            memory_scope: 'process',
            retention_policy: 'drop_on_done',
        })
        : null;

    if (!createdByProcess) {
        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: replyToRamKey,
            parent_memory_uid: `system:session:${session.sessionId}:context`,
            payload: createPayload,
            classifications: CLASSIFICATIONS,
        });
    }

    const updateResponseMemory = (payload: Record<string, unknown>) => {
        const updated = ownerProcessUid
            ? ProcessEngine.updateRuntimeMemory({
                owner_process_uid: ownerProcessUid,
                memory_uid: replyToRamKey,
                payload,
                classifications: CLASSIFICATIONS,
            })
            : false;
        if (!updated) {
            StorageEngine.dispatchRAMAction({
                action: 'update_memory',
                process_uid: ownerProcessUid,
                memory_uid: replyToRamKey,
                payload,
                classifications: CLASSIFICATIONS,
            });
        }
    };

    const sdkConfig = gatewayConfig.sdks[session.sdk];
    if (!sdkConfig?.api_key) {
        updateResponseMemory({
            status: 'error',
            error_message: `${session.sdk} API key not configured.`,
            finished_at: Date.now(),
        });
        session.status = 'connected';
        return {
            interrupted: false,
        };
    }

    const baseUrl = await ensureGatewayServerUrl();
    if (!baseUrl) {
        updateResponseMemory({
            status: 'error',
            error_message: 'Gateway server not reachable. Please start the gateway sidecar.',
            finished_at: Date.now(),
        });
        session.status = 'connected';
        return {
            interrupted: false,
        };
    }

    try {
        const response = await fetch(`${baseUrl}/chat/${session.sdk}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${sdkConfig.api_key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ model: session.model, prompt }),
        });

        if (!response.ok || !response.body) {
            const errorText = await response.text();
            updateResponseMemory({
                status: 'error',
                error_message: `Gateway error ${response.status}: ${errorText}`,
                finished_at: Date.now(),
            });
            session.status = 'connected';
            return {
                interrupted: false,
            };
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        const parserProcessUid = ownerProcessUid
            ? ProcessEngine.spawnSubprocess({
                parent_process_uid: ownerProcessUid,
                type: 'ai_gateway:parser_stream',
                metadata: {
                    session_id: session.sessionId,
                    reply_to_ram_key: replyToRamKey,
                },
                process_kind: 'ai_block',
                owner_engine: 'aiGatewayEngine',
                payload: {
                    status: 'running',
                    stage: 'stream_parse',
                },
            }).process_uid
            : undefined;

        if (parserProcessUid) {
            ProcessEngine.updateLifecycleState(parserProcessUid, 'running');
        }

        const closeParserProcess = (state: 'done' | 'failed') => {
            if (!parserProcessUid) return;
            ProcessEngine.updatePayload(parserProcessUid, {
                status: state,
                updated_at: Date.now(),
            });
            ProcessEngine.updateLifecycleState(parserProcessUid, state);
        };

        let interrupted = false;
        let interruptReason: string | undefined;
        let ignoreLateChunks = false;
        let ignoredChunkCount = 0;
        let ignoredByteCount = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
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
            );
            if (parseOutcome.interrupted) {
                interrupted = true;
                interruptReason = parseOutcome.reason;
                ignoreLateChunks = true;
                await reader.cancel();
                continue;
            }

            if (parserProcessUid) {
                ProcessEngine.updatePayload(parserProcessUid, {
                    status: 'running',
                    last_chunk_bytes: value.byteLength,
                    updated_at: Date.now(),
                });
            }
        }

        if (interrupted) {
            closeParserProcess('done');
            session.status = 'connected';
            updateResponseMemory({
                status: 'interrupted',
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
        if (ownerProcessUid) {
            // parser process may not exist for pre-fetch failures; this is safe no-op if missing.
            const parserCandidates = ProcessEngine.getAll()
                .filter((record) => record.parent_process_uid === ownerProcessUid && record.type === 'ai_gateway:parser_stream')
                .sort((a, b) => b.updated_at - a.updated_at);
            const latestParser = parserCandidates[0];
            if (latestParser?.process_uid) {
                ProcessEngine.updatePayload(latestParser.process_uid, {
                    status: 'failed',
                    error_message: error instanceof Error ? error.message : String(error),
                    updated_at: Date.now(),
                });
                ProcessEngine.updateLifecycleState(latestParser.process_uid, 'failed');
            }
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        updateResponseMemory({
            status: 'error',
            error_message: errorMessage,
            finished_at: Date.now(),
        });
        session.status = 'connected';
        return {
            interrupted: false,
        };
    }

    // ── FINALIZE ─────────────────────────────────────────────────────────────
    session.status = 'connected';
    updateResponseMemory({ status: 'completed', finished_at: Date.now() });

    return {
        interrupted: false,
    };
}
