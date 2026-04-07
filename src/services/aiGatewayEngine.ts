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
import { PROCESS_STATUS } from '#/schemas/process';
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


export type { SDKProvider, AISession } from './aiGateway/types';
import { AI_BLOCK_HANDLER_STATUS, AI_PROCESS_TYPE, AI_SESSION_STATUS } from './aiGateway/types';
import type { AIBlockHandlerStatus, SDKProvider } from './aiGateway/types';
import type { AISession } from './aiGateway/types';
import { KernelState } from './kernelEngine/kernelState';
import type { KernelAISessionEntry } from './kernelEngine/types';

class AIGatewayEngineSingleton {
    /**
     * RAM keys used by sub-modules — exposed here so other engines / UI panels
     * can subscribe to the right keys without importing sub-modules directly.
     */
    public readonly memory_uid = 'system:ai_gateway_config';

    private isBooted = false;
    private isRouteBound = false;
    private isTerminationHookBound = false;

    setupKernelSpace() {
        KernelEngine.registerSystemMemory(this.memory_uid, {});
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
        if (session.active_abort_controller) {
            session.active_abort_controller.abort();
            session.active_abort_controller = undefined;
        }

        if (session.status === AI_SESSION_STATUS.STREAMING) {
            session.status = AI_SESSION_STATUS.CONNECTED;
        }
    }

    private registerTerminationHooks() {
        if (this.isTerminationHookBound) return;

        // record is a ProcessRecord that contains metadata and payload from the process that is being terminated.
        // We can use this information to determine if the termination is related to an AI session or interaction
        // and perform appropriate cleanup (e.g. aborting streams, closing sessions, etc.).

        // Will automatically trigger when a process is terminated (either gracefully or forcefully) and 
        // allows us to clean up any associated AI session state to prevent orphaned sessions or memory leaks. 

        // This is especially important for long-running sessions that may still have active streams or context in Kernel.
        KernelEngine.registerTerminationHandler('aiGatewayEngine', ({ record }) => {

            const metadata = (record.metadata && typeof record.metadata === 'object')
                ? (record.metadata as Record<string, unknown>)
                : undefined;

            const payload = (record.payload && typeof record.payload === 'object')
                ? (record.payload as Record<string, unknown>)
                : undefined;

            const sessionUid = typeof metadata?.session_uid === 'string' 
                ? metadata.session_uid
                : typeof payload?.session_uid === 'string'
                    ? payload.session_uid
                    : undefined;
            
            if (!sessionUid) return;

            if (record.type === AI_PROCESS_TYPE.AI_SESSION_INSTANCE) {
                this.abortSessionStream(sessionUid);
                this.closeSession(sessionUid, { skipProcessLifecycle: true });
                return;
            }

        });

        this.isTerminationHookBound = true;
    }

    // ── EventBus route ────────────────────────────────────────────────────────

    // Registers the EventBus route for gateway interactions. This is idempotent and can be safely 
    // called multiple times.
    registerEventRoutes() {
        if (this.isRouteBound) return;

        registerSendGatewayRoute({
            createSession: async (sdk, model) => this.createSession(sdk, model),
            sendToSession: (sessionId, prompt, replyToRamKey, parentProcessUid) => this.sendToSession(sessionId, prompt, replyToRamKey, parentProcessUid),
            getActiveSDK: () => AIConfigManager.getActiveSDK(),
            getActiveModel: () => AIConfigManager.getActiveModel(),
        });

        this.isRouteBound = true;
    }

    // ── Session API ───────────────────────────────────────────────────────────

    /** Creates a new isolated session bound to a specific SDK + model. */
    // Future implementation subprocess agnetic using parent process_uid from the send_gateway route call, 
    // which allows subprocesses to be properly linked in the process tree without needing to know session IDs at the call site.
    createSession(sdk: SDKProvider, model: string, parentProcessUid?: string): string {
        
        // Create session in AISessionManager and spawn a new process for it.
        const session : AISession = AISessionManager.create(sdk, model);
        
        // Immediately mark the process as running so it's 
        // visible in monitors during the initial prompt processing stages.
        KernelEngine.updateProcessStatus(session.process_uid, PROCESS_STATUS.RUNNING);

        // Attach session to context engine and build initial context 
        // (empty prompt, but config + planning state will populate).
        AIContextEngine.attachSession(session.session_uid);
        AIContextEngine.buildContext(session.session_uid, '', { sdk, model });

        return session.session_uid;
    }

    /** Closes and removes a session from the active session map. */
    closeSession(sessionUid: string, options?: { skipProcessLifecycle?: boolean }): void {
        
        // First, attempt to retrieve the session entry from KernelState to 
        // ensure it exists before proceeding with cleanup.
        const session_kernel_entry = KernelState.ai_gateway_sessions.get(sessionUid) as KernelAISessionEntry | undefined;
        const session = KernelEngine.readMemory(session_kernel_entry?.memory_uid as string) as AISession | undefined;
        
        if(!session) {
            console.warn(`[AIGatewayEngine] Attempted to close non-existent session ${sessionUid}`);
            return;
        }

        if (session.process_uid && !options?.skipProcessLifecycle) {
            KernelEngine.updateProcessStatus(session.process_uid, PROCESS_STATUS.DONE, {
                live_state: 'closed',
                session_id: sessionUid,
                ended_at: Date.now(),
            });
        } 

        AISessionManager.close(sessionUid);

        // Skip below for now since we our ai session still containing as one big memory blob without subprocesses or 
        // shared memory pieces. But once we start spawning subprocesses for tool calls or using shared memory
        // for context, etc., we'll want to cascade terminate those child processes and clean up associated memory 
        // to prevent orphaned state and ensure proper lifecycle management.

        // AIContextEngine.evictContext(sessionUid);
        // AIContextMemoryEngine.deleteMemoriesBySession(sessionUid, { source_ref: 'ai_context_rag' });
    }

    /**
     * Returns read-only snapshots for all active sessions.
     * Intended for Dev Menu monitoring panels — not for runtime logic.
     */
    listSessions(): AISession[] {
        return AISessionManager.list();
    }

    // Sending prompt to session is technically part of the interaction loop logic, but it requires 
    // direct access to the session's process and memory management, so it lives here in the engine as 
    // a bridge between the public API and the internal interaction loop implementation.

    async sendToSession(
        sessionUid: string,
        prompt: string,
        reply_to_ram_key: string,
        parent_process_uid?: string,
    ): Promise<void> {
        const session = AISessionManager.get(sessionUid);
        if (!session) throw new Error(`Session ${sessionUid} not found.`);

        const resolvedParentProcessUid = parent_process_uid ?? session.process_uid;

        await executeSessionInteractionLoop({
            session,
            sessionUid,
            prompt,
            replyToRamKey: reply_to_ram_key,
            parentProcessUid: resolvedParentProcessUid,
        });
    }

    finalizeProtocolState(
        session : AISession,
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
