/**
 * AIGatewayEngine
 *
 * Top-level singleton orchestrating all AI gateway functionality.
 *
 * Architecture — sub-module breakdown:
 * ┌──────────────────────────────────────────────────────────┐
 * │                    AIGatewayEngine                       │
 * │  boot() · EventBus route · session API · public surface  │
 * └────┬─────────────┬──────────────┬──────────────┬─────────┘
 *      │             │              │              │
 * AIConfigManager  HealthProbe  ProviderClient  AISessionManager
 * (gateway.json    (sidecar       (/models,       (session
 *  R/W + RAM sync)  discovery)     /test calls)    lifecycle)
 *                                       │
 *                              httpClient → streamHandler
 *                              (SSE stream)  (chunk parsing +
 *                                             EventBus dispatch)
 *
 * Sub-module responsibilities:
 *  - AIConfigManager  → gateway.json persistence + RAM sync
 *  - HealthProbe      → /health probing + port-range radar scan
 *  - ProviderClient   → /models + /test non-streaming HTTP calls
 *  - AISessionManager → session map (create / close / list / get)
 *  - httpClient       → stream a prompt into a RAM key
 *  - streamHandler    → parse SSE chunks + dispatch EventBus interactions
 *
 * This file is intentionally thin: all logic lives in the sub-modules.
 * The engine owns boot ordering, EventBus route binding, and delegates
 * every other concern to the appropriate sub-module.
 */

import { AISessionManager } from './aiGateway/sessionManager';
import { registerSendGatewayRoute } from './aiGateway/sendGatewayRoute';
import { AIConfigManager } from './aiGateway/configManager';
import { HealthProbe } from './aiGateway/healthProbe';
import { fetchModels as _fetchModels, testResponse as _testResponse } from './aiGateway/providerClient';
import { executeSessionInteractionLoop } from './aiGateway/interactionLoop';
import { finalizeRequestProtocolState } from './aiGateway/protocolLifecycle';
import { AIContextEngine } from './aiContextEngine';
import { AIContextMemoryEngine } from './aiContextMemoryEngine';
import { KernelEngine } from './kernelEngine';
import { PROCESS_KIND, PROCESS_STATUS } from '#/schemas/process';
import type {
    AIGatewayFetchModelsResult,
    AIGatewayResponseResult,
    AIGatewaySidecarHealthResult,
    AIGatewayRadarScanResult,
} from '../schemas/ai_gateway';

function getLifecyclePhase(eventName?: string): 'dispatch' | 'started' | 'result' | 'error' | 'failed' | 'other' {
    if (!eventName) return 'other';
    const normalized = eventName.toLowerCase();
    if (normalized.endsWith('_dispatch')) return 'dispatch';
    if (normalized.endsWith('_started') || normalized.includes('parsing_started')) return 'started';
    if (normalized.endsWith('_result') || normalized.includes('parsing_completed')) return 'result';
    if (normalized.endsWith('_error')) return 'error';
    if (normalized.endsWith('_failed') || normalized.includes('parse_failed')) return 'failed';
    return 'other';
}

function isLifecycleEventName(eventName?: string): boolean {
    const phase = getLifecyclePhase(eventName);
    return phase !== 'other';
}


export type { SDKProvider, AISession, AISessionSnapshot } from './aiGateway/types';
import { AI_BLOCK_HANDLER_STATUS, AI_GATEWAY_PROCESS_TYPE, AI_SESSION_STATUS } from './aiGateway/types';
import type { AIBlockHandlerStatus, SDKProvider, AISessionSnapshot } from './aiGateway/types';

class AIGatewayEngineSingleton {
    /**
     * RAM keys used by sub-modules — exposed here so other engines / UI panels
     * can subscribe to the right keys without importing sub-modules directly.
     */
    public readonly memory_uid = 'system:ai_gateway_config';
    public readonly runtime_memory_uid = 'system:ai_gateway_runtime';

    private isBooted = false;
    private isRouteBound = false;
    private readonly sessionProcessBySessionId = new Map<string, string>();
    private isTerminationHookBound = false;

    setupKernelSpace() {
        KernelEngine.registerSystemMemory(this.memory_uid, null);
        KernelEngine.registerSystemMemory(this.runtime_memory_uid, null);
    }

    // ── Boot ──────────────────────────────────────────────────────────────────

    /**
     * Initializes the gateway engine. Boot order matters:
     *
     *  1. Bind EventBus route (idempotent — safe to bind before other engines)
     *  2. Load + validate config from disk → RAM  (AIConfigManager)
     *  3. Health-check the default gateway URL    (HealthProbe)
     *  4. If unreachable, radar-scan ports 8888–8930 for the sidecar
     *
     * Intentionally non-throwing — missing config or unreachable sidecar is a
     * soft error: AI features degrade gracefully until the sidecar is started.
     */
    async boot() {
        if (this.isBooted) return;

        this.registerTerminationHooks();

        AIContextEngine.boot();
        await AIConfigManager.load();

        const health = await HealthProbe.probe();
        if (!health.ok) {
            console.warn('[AIGatewayEngine] Default gateway URL unreachable. Running radar scan…');
            const radar = await HealthProbe.radarScan(8888, 8930);
            if (radar.active_base_url) {
                console.info(`[AIGatewayEngine] Found gateway at ${radar.active_base_url}`);
            } else {
                console.warn('[AIGatewayEngine] Gateway sidecar not found. AI features unavailable.');
            }
        }

        this.isBooted = true;
    }

    private abortSessionStream(sessionId: string): void {
        const session = AISessionManager.get(sessionId);
        if (!session) return;

        session.termination_requested = true;
        if (session.activeAbortController) {
            session.activeAbortController.abort();
            session.activeAbortController = undefined;
        }
        if (session.status === AI_SESSION_STATUS.STREAMING) {
            session.status = AI_SESSION_STATUS.CONNECTED;
        }
    }

    private registerTerminationHooks() {
        if (this.isTerminationHookBound) return;

        KernelEngine.registerTerminationHandler('aiGatewayEngine', ({ record }) => {
            const metadata = (record.metadata && typeof record.metadata === 'object')
                ? (record.metadata as Record<string, unknown>)
                : undefined;
            const payload = (record.payload && typeof record.payload === 'object')
                ? (record.payload as Record<string, unknown>)
                : undefined;

            const sessionId = typeof metadata?.session_id === 'string'
                ? metadata.session_id
                : typeof payload?.session_id === 'string'
                    ? payload.session_id
                    : undefined;
            if (!sessionId) return;

            if (record.type === AI_GATEWAY_PROCESS_TYPE.SESSION) {
                this.abortSessionStream(sessionId);
                this.closeSession(sessionId, { skipProcessLifecycle: true });
                return;
            }

            if (record.type === AI_GATEWAY_PROCESS_TYPE.RESPONSE_TURN || record.type === AI_GATEWAY_PROCESS_TYPE.PARSER_STREAM) {
                this.abortSessionStream(sessionId);
            }
        });

        this.isTerminationHookBound = true;
    }

    // ── EventBus route ────────────────────────────────────────────────────────

    /**
     * Registers the `send_gateway` process route on the EventBus.
     *
     * Expected payload:
     * ```
     * { prompt: string, reply_to_ram_key?: string }
     * ```
     *
     * Expected preallocated_memory (all optional overrides):
     * ```
     * { reply_to_ram_key?, session_id?, sdk?, model? }
     * ```
     *
     * Resolution order:
     *  - RAM key:    preallocated_memory.reply_to_ram_key → payload.reply_to_ram_key → auto-generated
     *  - SDK/model:  preallocated_memory overrides → active config → hardcoded fallback
     *  - Session ID: preallocated_memory.session_id → auto-create fresh session
     */
    registerEventRoutes() {
        if (this.isRouteBound) return;

        registerSendGatewayRoute({
            createSession: (sdk, model, parentProcessUid) => this.createSession(sdk, model, parentProcessUid),
            sendToSession: (sessionId, prompt, replyToRamKey, parentProcessUid) => this.sendToSession(sessionId, prompt, replyToRamKey, parentProcessUid),
            getActiveSDK: () => AIConfigManager.getActiveSDK(),
            getActiveModel: () => AIConfigManager.getActiveModel(),
        });

        this.isRouteBound = true;
    }

    // ── Session API ───────────────────────────────────────────────────────────

    /** Creates a new isolated session bound to a specific SDK + model. */
    async createSession(sdk: SDKProvider, model: string, parentProcessUid?: string): Promise<string> {
        const sessionId = await AISessionManager.create(sdk, model);

        const processRecord = parentProcessUid
            ? KernelEngine.spawnSubprocess(parentProcessUid, AI_GATEWAY_PROCESS_TYPE.SESSION, {
                metadata: {
                    session_id: sessionId,
                    sdk,
                    model,
                },
                process_kind: PROCESS_KIND.CUSTOM,
                owner_engine: 'aiGatewayEngine',
                payload: {
                    status: PROCESS_STATUS.RUNNING,
                    live_state: 'connected',
                    session_id: sessionId,
                    sdk,
                    model,
                },
            })
            : KernelEngine.spawnProcess(AI_GATEWAY_PROCESS_TYPE.SESSION, {
                session_id: sessionId,
                sdk,
                model,
            }, {
                process_kind: PROCESS_KIND.CUSTOM,
                owner_engine: 'aiGatewayEngine',
                payload: {
                    status: PROCESS_STATUS.RUNNING,
                    live_state: 'connected',
                    session_id: sessionId,
                    sdk,
                    model,
                },
            });

        KernelEngine.updateProcessStatus(processRecord.process_uid, PROCESS_STATUS.RUNNING);
        this.sessionProcessBySessionId.set(sessionId, processRecord.process_uid);

        AIContextEngine.attachSession(sessionId);
        AIContextEngine.buildContext(sessionId, '', { sdk, model });
        return sessionId;
    }

    /** Closes and removes a session from the active session map. */
    closeSession(sessionId: string, options?: { skipProcessLifecycle?: boolean }): void {
        const sessionProcessUid = this.sessionProcessBySessionId.get(sessionId);
        if (sessionProcessUid && !options?.skipProcessLifecycle) {
            KernelEngine.updateProcessPayload(sessionProcessUid, {
                status: PROCESS_STATUS.DONE,
                live_state: 'closed',
                session_id: sessionId,
                ended_at: Date.now(),
            });
            KernelEngine.updateProcessStatus(sessionProcessUid, PROCESS_STATUS.DONE);
            this.sessionProcessBySessionId.delete(sessionId);
        } else if (sessionProcessUid && options?.skipProcessLifecycle) {
            this.sessionProcessBySessionId.delete(sessionId);
        }

        AISessionManager.close(sessionId);
        AIContextEngine.evictContext(sessionId);
        AIContextMemoryEngine.deleteMemoriesBySession(sessionId, { source_ref: 'ai_context_rag' });
    }

    /**
     * Returns read-only snapshots for all active sessions.
     * Intended for Dev Menu monitoring panels — not for runtime logic.
     */
    listSessions(): AISessionSnapshot[] {
        return AISessionManager.list().map((snapshot) => {
            // Group 1: base context and response memory used by monitor panels.
            const contextState = AIContextEngine.getSessionContext(snapshot.sessionId);
            const responseMemory = snapshot.activeOutputRamKey
                ? (KernelEngine.readMemory(snapshot.activeOutputRamKey) as Record<string, unknown> | undefined)
                : undefined;

            // Group 2: lifecycle timeline extracted from parser runtime records.
            const parserResults = Array.isArray(responseMemory?.parser_handler_results)
                ? (responseMemory?.parser_handler_results as Array<Record<string, unknown>>)
                : [];
            const lifecycleEvents = parserResults
                .filter((record) => {
                    // event_name marks parser lifecycle stages (dispatch/started/result/error/failed).
                    const eventName = typeof record.event_name === 'string' ? record.event_name : '';
                    return isLifecycleEventName(eventName);
                })
                .sort((a, b) => {
                    // Keep chronological order so "latest" truly means newest signal.
                    const atA = typeof a.at === 'number' ? a.at : 0;
                    const atB = typeof b.at === 'number' ? b.at : 0;
                    return atA - atB;
                });

            // Group 3: latest lifecycle signal + normalized metadata for status derivation.
            const latestLifecycle = lifecycleEvents.length > 0 ? lifecycleEvents[lifecycleEvents.length - 1] : undefined;
            const latestEventName = typeof latestLifecycle?.event_name === 'string' ? latestLifecycle.event_name : undefined;
            const latestPayload = latestLifecycle && typeof latestLifecycle.payload === 'object'
                ? (latestLifecycle.payload as Record<string, unknown>)
                : undefined;
            const latestAction = typeof latestPayload?.action === 'string' ? latestPayload.action : undefined;
            const latestResultMemoryUid = typeof latestPayload?.result_memory_uid === 'string' ? latestPayload.result_memory_uid : undefined;
            const latestUpdatedAt = typeof latestLifecycle?.at === 'number' ? latestLifecycle.at : undefined;
            const latestPhase = getLifecyclePhase(latestEventName);
            const latestBlockSlug = typeof latestPayload?.block_slug === 'string'
                ? latestPayload.block_slug
                : typeof latestLifecycle?.parsed_tag === 'string'
                    ? latestLifecycle.parsed_tag
                    : undefined;

            // Group 4: boolean flags that explain why a status becomes running/parsing/failed.
            const isHandlerRunning = latestPhase === 'dispatch' || latestPhase === 'started';
            const parserRuntimeStatus = typeof responseMemory?.parser_runtime_status === 'string' ? responseMemory.parser_runtime_status : undefined;
            const isParserFailed =
                latestPhase === 'failed' ||
                (latestBlockSlug === 'parser' && latestPhase === 'error') ||
                parserRuntimeStatus === 'failed';
            const isParserParsing =
                snapshot.status === 'streaming' &&
                !isParserFailed &&
                ((latestBlockSlug === 'parser' && isHandlerRunning) || (!latestBlockSlug && !isHandlerRunning));

            // Group 5: final derived state used by UI monitors.
            const derivedStatus: AIBlockHandlerStatus =
                isParserFailed
                    ? AI_BLOCK_HANDLER_STATUS.FAILED
                    : isHandlerRunning
                        ? (latestBlockSlug === 'parser' ? AI_BLOCK_HANDLER_STATUS.PARSING : AI_BLOCK_HANDLER_STATUS.RUNNING)
                        : isParserParsing
                            ? AI_BLOCK_HANDLER_STATUS.PARSING
                            : AI_BLOCK_HANDLER_STATUS.IDLE;

            // block_slug represents the active runtime focus shown in block_handler_state.
            const derivedBlockSlug =
                latestBlockSlug
                    ? latestBlockSlug
                    : latestEventName
                        ? 'handler'
                    : isParserFailed
                            ? 'parser'
                            : undefined;

            // Group 6: merge static session snapshot with derived monitor diagnostics.
            return {
                ...snapshot,
                used_contexts: contextState?.used_contexts ?? [],
                context_updated_at: contextState?.updated_at,
                summary: contextState?.summary,
                turns: contextState?.turns ?? [],
                history_summaries: contextState?.history_summaries ?? [],
                context_blocks: contextState?.context_blocks ?? [],
                protocol_state: snapshot.protocol_state,
                block_handler_state: {
                    status: derivedStatus,
                    block_slug: derivedBlockSlug,
                    action: latestAction,
                    event_name: latestEventName,
                    result_memory_uid: latestResultMemoryUid,
                    updated_at: latestUpdatedAt,
                },
            };
        });
    }

    /**
     * Sends a prompt to an existing session and streams the response into RAM.
     *
     * Config is snapshotted at call time (AIConfigManager.get()) so any
     * in-flight config changes do not affect the current request.
     */
    async sendToSession(
        sessionId: string,
        prompt: string,
        reply_to_ram_key: string,
        parent_process_uid?: string,
    ): Promise<void> {
        const session = AISessionManager.get(sessionId);
        if (!session) throw new Error(`Session ${sessionId} not found.`);

        const sessionProcessUid = this.sessionProcessBySessionId.get(sessionId);
        const resolvedParentProcessUid = parent_process_uid ?? sessionProcessUid;

        await executeSessionInteractionLoop({
            session,
            sessionId,
            prompt,
            replyToRamKey: reply_to_ram_key,
            parentProcessUid: resolvedParentProcessUid,
        });
    }

    finalizeProtocolState(
        session: { sessionId: string; currentProtocolState?: import('./aiGateway/types').AIRequestProtocolState; lastProtocolState?: import('./aiGateway/types').AIRequestProtocolState },
        prompt: string,
        responseText: string,
        rawResponse: string,
    ) {
        return finalizeRequestProtocolState({
            session,
            prompt,
            responseText,
            rawResponse,
        });
    }

    // ── Health / Discovery ────────────────────────────────────────────────────

    /** Returns the currently cached active gateway base URL. */
    getGatewayBaseUrl(): string {
        return HealthProbe.getBaseUrl();
    }

    /** Probes the sidecar and updates the `system:ai_gateway_runtime` RAM key. */
    async healthCheckSidecar(baseUrl?: string): Promise<AIGatewaySidecarHealthResult> {
        return HealthProbe.probe(baseUrl);
    }

    /**
     * Scans a port range in parallel.
     * Used when the default port 8888 is unreachable and a dynamic port may be
     * in effect (e.g. when multiple gateway instances are running).
     */
    async radarScanPorts(startPort = 8888, endPort = 8930): Promise<AIGatewayRadarScanResult> {
        return HealthProbe.radarScan(startPort, endPort);
    }

    /** Re-verifies the active gateway URL before any outbound HTTP call. */
    async ensureGatewayServerUrl(): Promise<string | null> {
        return HealthProbe.ensure();
    }

    // ── Config API ────────────────────────────────────────────────────────────

    getConfig() {
        return AIConfigManager.get();
    }

    getActiveSDK(): SDKProvider | null {
        return AIConfigManager.getActiveSDK();
    }

    getActiveModel(): string | null {
        return AIConfigManager.getActiveModel();
    }

    async setActiveSDK(sdk: SDKProvider | null): Promise<boolean> {
        return AIConfigManager.setActiveSDK(sdk);
    }

    async setActiveModel(model: string | null): Promise<boolean> {
        return AIConfigManager.setActiveModel(model);
    }

    async setSDKApiKey(sdk: SDKProvider, apiKey: string): Promise<boolean> {
        return AIConfigManager.setSDKApiKey(sdk, apiKey);
    }

    // ── Provider calls ────────────────────────────────────────────────────────

    /**
     * Fetches the available model list for a given SDK from the gateway sidecar.
     * On success, the list is persisted into config via AIConfigManager so it
     * survives app restarts without re-fetching.
     */
    async fetchModels(sdk: SDKProvider): Promise<AIGatewayFetchModelsResult> {
        const result = await _fetchModels(sdk, AIConfigManager.get(), () => HealthProbe.ensure());
        if (result.ok && result.models.length > 0) {
            await AIConfigManager.updateSDKModels(sdk, result.models);
        }
        return result;
    }

    /**
     * Sends a single non-streaming test prompt.
     * Used by Settings panel to verify a provider + model before saving.
     */
    async testResponse(sdk: SDKProvider, model: string, prompt: string): Promise<AIGatewayResponseResult> {
        return _testResponse(sdk, model, prompt, AIConfigManager.get(), () => HealthProbe.ensure());
    }
}

export const AIGatewayEngine = new AIGatewayEngineSingleton();
