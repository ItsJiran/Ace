import { EventBus } from '#/services/eventEngine';
import { HealthProbe } from '#/services/aiGateway/healthProbe';
import { KernelEngine } from '#/services/kernelEngine';
import type { AISessionRuntime } from '#/schemas/ai';

const TOOL_INTENT_POLL_INTERVAL_MS = 150;

interface GatewayToolIntentPayload {
    kind?: string;
    request_id?: string;
    package_ref?: string;
    tool_slug?: string;
    payload?: unknown;
    reason?: string;
}

export async function pumpPendingGatewayToolIntents(
    session_uid: string,
    signal: AbortSignal,
): Promise<void> {
    while (!signal.aborted) {
        const baseUrl = await HealthProbe.ensure();
        if (!baseUrl) {
            await delay(TOOL_INTENT_POLL_INTERVAL_MS, signal);
            continue;
        }

        try {
            const response = await fetch(`${baseUrl}/tool-intents/${encodeURIComponent(session_uid)}`, {
                method: 'GET',
                signal,
            });

            if (!response.ok) {
                await delay(TOOL_INTENT_POLL_INTERVAL_MS, signal);
                continue;
            }

            const body = await response.json() as {
                intents?: GatewayToolIntentPayload[];
            };
            const intents = Array.isArray(body.intents) ? body.intents : [];
            for (const intent of intents) {
                dispatchGatewayToolIntent(session_uid, intent);
            }
        } catch (error) {
            if (signal.aborted) {
                return;
            }
            console.warn('[AIGateway] Failed to fetch pending gateway tool intents:', error);
        }

        await delay(TOOL_INTENT_POLL_INTERVAL_MS, signal);
    }
}

function dispatchGatewayToolIntent(session_uid: string, intent: GatewayToolIntentPayload): void {
    const requestId = typeof intent.request_id === 'string' ? intent.request_id : '';
    const packageRef = typeof intent.package_ref === 'string' ? intent.package_ref : '';
    const toolSlug = typeof intent.tool_slug === 'string' ? intent.tool_slug : '';
    const sessionState = KernelEngine.readMemory(`system:ai_session:${session_uid}:state`) as AISessionRuntime | undefined;
    const processUid = typeof sessionState?.process_uid === 'string' ? sessionState.process_uid : '';

    if (!requestId || !packageRef || !toolSlug || !processUid) {
        return;
    }

    const dispatchMemoryKey = `system:ai_session:${session_uid}:gateway_tool_dispatch:${requestId}`;
    if (KernelEngine.readMemory(dispatchMemoryKey)) {
        return;
    }

    KernelEngine.createMemoryIfNotExist(dispatchMemoryKey, {
        dispatched_at: Date.now(),
        request_id: requestId,
        package_ref: packageRef,
        tool_slug: toolSlug,
    }, processUid);

    EventBus.emit({
        event_type: 'interaction',
        action: 'execute_tool',
        process_uid: processUid,
        payload: {
            request_id: requestId,
            package_ref: packageRef,
            tool_slug: toolSlug,
            payload: isRecord(intent.payload) ? intent.payload : {},
            source: 'gateway_tool_http_intent',
            reason: typeof intent.reason === 'string' ? intent.reason : undefined,
        },
        preallocated_memory: {
            parent_process_uid: processUid,
            session_id: session_uid,
            gateway_tool_request_id: requestId,
            gateway_tool_intent_key: dispatchMemoryKey,
        },
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, ms);

        const onAbort = () => {
            clearTimeout(timeout);
            signal.removeEventListener('abort', onAbort);
            resolve();
        };

        signal.addEventListener('abort', onAbort, { once: true });
    });
}