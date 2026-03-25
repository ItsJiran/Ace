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
 * @param prompt            User prompt to send.
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
): Promise<void> {
    console.log(`[AIGatewayEngine] [${session.sessionId}] Sending: "${prompt}"`);
    session.status = 'streaming';
    session.activeOutputRamKey = replyToRamKey;

    // ── PRE-ALLOCATION: write empty placeholder so subscribers see 'streaming' ──
    StorageEngine.dispatchRAMAction({
        action: 'create_memory',
        memory_uid: replyToRamKey,
        payload: {
            prompt,
            text: '',
            raw_response: '',
            blocks: [],
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

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            handleSessionStreamChunk(session, chunk, replyToRamKey);
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
