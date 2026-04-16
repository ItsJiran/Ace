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
// import { registerSendGatewayRoute } from './aiGateway/sendGatewayRoute';
import { AIConfigManager } from './aiGateway/configManager';
import { HealthProbe } from './aiGateway/healthProbe';
import { fetchModels as _fetchModels, testResponse as _testResponse } from './aiGateway/providerClient';
import { executeSessionInteractionLoop } from './aiGateway/interactionLoop';
import { KernelEngine } from './kernelEngine';
import { PROCESS_STATUS } from '#/schemas/process';

import type {
    AIGatewayFetchModelsResult,
    AIGatewayResponseResult,
    AIGatewaySidecarHealthResult,
    AIGatewayRadarScanResult,
    AIGatewayConfig,
} from '../schemas/ai_gateway';

import type { SDKProvider, AISession, AIHistoryEntry, AIWorkingMemoryEntry } from '#/schemas/ai';
import { AIProcessType } from '#/schemas/ai';

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

        // AIContextEngine.boot();
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

        KernelEngine.updateMemory(`system:ai_session:${sessionId}:state`, {
            termination_requested: true,
            autonomous_follow_up_loop_status: 'interrupted',
        } as Partial<AISession>);

        if (session.active_abort_controller) {
            session.active_abort_controller.abort();
            KernelEngine.updateMemory(`system:ai_session:${sessionId}:state`, {
                active_abort_controller: undefined,
            } as Partial<AISession>);
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

            if (record.type === AIProcessType.AI_SESSION_INSTANCE) {
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

        // registerSendGatewayRoute({
        //     createSession: async (sdk, model) => this.createSession(sdk, model),
        //     sendToSession: (sessionId, prompt, replyToRamKey, parentProcessUid) => this.sendToSession(sessionId, prompt, replyToRamKey, parentProcessUid),
        //     getActiveSDK: () => AIConfigManager.getActiveSDK(),
        //     getActiveModel: () => AIConfigManager.getActiveModel(),
        // });

        this.isRouteBound = true;
    }

    // ── Session API ───────────────────────────────────────────────────────────

    /** Creates a new isolated session bound to a specific SDK + model. */
    // Future implementation subprocess agnetic using parent process_uid from the send_gateway route call, 
    // which allows subprocesses to be properly linked in the process tree without needing to know session IDs at the call site.
    createSession(sdk?: SDKProvider | undefined, model?: string | undefined,): AISession {    
        const session : AISession = AISessionManager.create(sdk, model);
        return session;
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
    ): Promise<void> {
        const session = AISessionManager.get(sessionUid);
        if (!session) throw new Error(`Session ${sessionUid} not found.`);

        await executeSessionInteractionLoop({
            session,
            prompt,
        });
    }

    interruptSession(sessionUid: string): void {
        this.abortSessionStream(sessionUid);
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

    getConfig() : AIGatewayConfig {
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

    appendHistoryResponseSummary(
        sessionState: AISession,
        turnIndex: number,
        summary: string,
        payload?: Record<string, unknown>,
    ): Record<number, AIHistoryEntry> {
        const history = { ...(sessionState.history ?? {}) };
        const existingEntry = history[turnIndex];
        const nextResponses = [...(existingEntry?.responses ?? [])];
        const nextIndex = nextResponses.reduce((max, event) => Math.max(max, event.index), -1) + 1;
        const now = Date.now();
        nextResponses.push({
            index: nextIndex,
            block_slug: typeof payload?.action === 'string' ? String(payload.action).split(':')[0].replace(/_/g, '-') : 'system',
            status: 'completed',
            summary: summary.trim(),
            at: now,
            updated_at: now,
            payload,
        });

        history[turnIndex] = {
            at: now,
            turn_index: turnIndex,
            status: 'active',
            lifecycle_turn: sessionState.turn_index,
            prompt: existingEntry?.prompt,
            responses: nextResponses,
            payload: existingEntry?.payload,
        };

        return history;
    }

    allocateHistoryEventSlot(
        sessionState: AISession,
        turnIndex: number,
        input: {
            block_slug: string;
            entry_index?: number;
            block_index?: number;
        },
    ): { history: Record<number, AIHistoryEntry>; historyEventIndex: number } {
        const history = { ...(sessionState.history ?? {}) };
        const existingEntry = history[turnIndex];
        const payload = { ...(existingEntry?.payload ?? {}) };
        const events = [...(existingEntry?.responses ?? [])];

        const existingEvent = events.find((event) => (
            event.block_slug === input.block_slug
            && event.entry_index === input.entry_index
            && event.block_index === input.block_index
        ));

        if (existingEvent) {
            return { history, historyEventIndex: existingEvent.index };
        }

        const now = Date.now();
        const historyEventIndex = events.reduce((max, event) => Math.max(max, event.index), -1) + 1;
        events.push({
            index: historyEventIndex,
            block_slug: input.block_slug,
            entry_index: input.entry_index,
            block_index: input.block_index,
            status: 'allocated',
            at: now,
            updated_at: now,
        });

        history[turnIndex] = {
            at: now,
            turn_index: turnIndex,
            status: 'active',
            lifecycle_turn: sessionState.turn_index,
            prompt: existingEntry?.prompt,
            responses: events,
            payload,
        };

        return { history, historyEventIndex };
    }

    writeHistoryEventSummary(
        sessionState: AISession,
        turnIndex: number,
        historyEventIndex: number,
        summary: string,
        payload?: Record<string, unknown>,
        options?: { mirrorToResponse?: boolean; status?: 'completed' | 'aborted'; block_slug?: string },
    ): Record<number, AIHistoryEntry> {
        const history = { ...(sessionState.history ?? {}) };
        const existingEntry = history[turnIndex];
        const nextPayload = { ...(existingEntry?.payload ?? {}) };
        const events = [...(existingEntry?.responses ?? [])];
        const eventIndex = events.findIndex((event) => event.index === historyEventIndex);
        const now = Date.now();
        const nextEvent = {
            ...(eventIndex >= 0 ? events[eventIndex] : {
                index: historyEventIndex,
                block_slug: options?.block_slug ?? 'unknown',
                status: 'allocated' as const,
                at: now,
                updated_at: now,
            }),
            status: options?.status ?? 'completed',
            summary: summary.trim(),
            updated_at: now,
            payload: {
                ...((eventIndex >= 0 ? events[eventIndex]?.payload : {}) ?? {}),
                ...(payload ?? {}),
            },
        };

        if (eventIndex >= 0) {
            events[eventIndex] = nextEvent;
        } else {
            events.push(nextEvent);
        }

        history[turnIndex] = {
            at: now,
            turn_index: turnIndex,
            status: 'active',
            lifecycle_turn: sessionState.turn_index,
            prompt: existingEntry?.prompt,
            responses: events,
            payload: nextPayload,
        };

        return history;
    }

    upsertWorkingMemoryEntry(
        sessionState: AISession,
        entry: AIWorkingMemoryEntry,
    ): AIWorkingMemoryEntry[] {
        const workingMemory = [...(sessionState.working_memory ?? [])]
            .filter((existingEntry) => existingEntry.uid !== entry.uid);
        workingMemory.push(entry);
        return workingMemory;
    }

    dropWorkingMemoryEntry(
        sessionState: AISession,
        uid: string,
    ): AIWorkingMemoryEntry[] {
        return [...(sessionState.working_memory ?? [])]
            .filter((entry) => entry.uid !== uid);
    }
}

export const AIGatewayEngine = new AIGatewayEngineSingleton();
