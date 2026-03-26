import { StorageEngine } from '../storageEngine';
import { handleSessionStreamChunk } from './streamHandler';
import type { AISession } from './types';
import type { AIGatewayConfig } from '../../schemas/ai_gateway';

const CLASSIFICATIONS: string[] = ['system:dev', 'system:ai_parser'];

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
    },
): Promise<void> {
    console.log(`[AIGatewayEngine] [${session.sessionId}] Sending: "${prompt}"`);
    session.status = 'streaming';
    session.activeOutputRamKey = replyToRamKey;

    // ── PRE-ALLOCATION: write empty placeholder so subscribers see 'streaming' ──
    StorageEngine.dispatchRAMAction({
        action: 'create_memory',
        memory_uid: replyToRamKey,
        parent_memory_uid: `system:session:${session.sessionId}:context`,
        payload: {
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
            started_at: Date.now(),
        },
        classifications: CLASSIFICATIONS,
    });

    const sdkConfig = gatewayConfig.sdks[session.sdk];
    if (!sdkConfig?.api_key) {
        StorageEngine.dispatchRAMAction({
            action: 'update_memory',
            memory_uid: replyToRamKey,
            payload: {
                status: 'error',
                error_message: `${session.sdk} API key not configured.`,
                finished_at: Date.now(),
            },
            classifications: CLASSIFICATIONS,
        });
        session.status = 'connected';
        return;
    }

    const baseUrl = await ensureGatewayServerUrl();
    if (!baseUrl) {
        StorageEngine.dispatchRAMAction({
            action: 'update_memory',
            memory_uid: replyToRamKey,
            payload: {
                status: 'error',
                error_message: 'Gateway server not reachable. Please start the gateway sidecar.',
                finished_at: Date.now(),
            },
            classifications: CLASSIFICATIONS,
        });
        session.status = 'connected';
        return;
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
            StorageEngine.dispatchRAMAction({
                action: 'update_memory',
                memory_uid: replyToRamKey,
                payload: {
                    status: 'error',
                    error_message: `Gateway error ${response.status}: ${errorText}`,
                    finished_at: Date.now(),
                },
                classifications: CLASSIFICATIONS,
            });
            session.status = 'connected';
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

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
            const parseOutcome = handleSessionStreamChunk(session, chunk, replyToRamKey);
            if (parseOutcome.interrupted) {
                interrupted = true;
                interruptReason = parseOutcome.reason;
                ignoreLateChunks = true;
                await reader.cancel();
                continue;
            }
        }

        if (interrupted) {
            session.status = 'connected';
            StorageEngine.dispatchRAMAction({
                action: 'update_memory',
                memory_uid: replyToRamKey,
                payload: {
                    status: 'interrupted',
                    parser_interrupt_reason: interruptReason ?? 'parser_interrupt_requested',
                    ignored_after_interrupt_chunks: ignoredChunkCount,
                    ignored_after_interrupt_bytes: ignoredByteCount,
                    finished_at: Date.now(),
                },
                classifications: CLASSIFICATIONS,
            });
            return;
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        StorageEngine.dispatchRAMAction({
            action: 'update_memory',
            memory_uid: replyToRamKey,
            payload: {
                status: 'error',
                error_message: errorMessage,
                finished_at: Date.now(),
            },
            classifications: CLASSIFICATIONS,
        });
        session.status = 'connected';
        return;
    }

    // ── FINALIZE ─────────────────────────────────────────────────────────────
    session.status = 'connected';
    StorageEngine.dispatchRAMAction({
        action: 'update_memory',
        memory_uid: replyToRamKey,
        payload: { status: 'completed', finished_at: Date.now() },
        classifications: CLASSIFICATIONS,
    });
}
