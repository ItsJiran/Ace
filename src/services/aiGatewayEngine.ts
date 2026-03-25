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

import { EventBus } from './eventEngine';
import { StorageEngine } from './storageEngine';
import { AISessionManager } from './aiGateway/sessionManager';
import { sendToSession as _sendToSession } from './aiGateway/httpClient';
import { AIConfigManager } from './aiGateway/configManager';
import { HealthProbe } from './aiGateway/healthProbe';
import { fetchModels as _fetchModels, testResponse as _testResponse } from './aiGateway/providerClient';
import type {
    AIGatewayFetchModelsResult,
    AIGatewayResponseResult,
    AIGatewaySidecarHealthResult,
    AIGatewayRadarScanResult,
} from '../schemas/ai_gateway';

export type { SDKProvider, AISession, AISessionSnapshot } from './aiGateway/types';
import type { SDKProvider, AISessionSnapshot } from './aiGateway/types';

class AIGatewayEngineSingleton {
    /**
     * RAM keys used by sub-modules — exposed here so other engines / UI panels
     * can subscribe to the right keys without importing sub-modules directly.
     */
    public readonly memory_uid = 'system:ai_gateway_config';
    public readonly runtime_memory_uid = 'system:ai_gateway_runtime';

    private isBooted = false;
    private isRouteBound = false;

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

        this.bindEventRoutes();
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
    private bindEventRoutes() {
        if (this.isRouteBound) return;

        EventBus.registerProcessRoute('send_gateway', async ({ payload, preallocated_memory }) => {
            const prompt = typeof payload?.prompt === 'string' ? payload.prompt.trim() : '';
            const replyToRamKey =
                typeof preallocated_memory?.reply_to_ram_key === 'string'
                    ? preallocated_memory.reply_to_ram_key
                    : typeof payload?.reply_to_ram_key === 'string'
                        ? payload.reply_to_ram_key
                        : `system:ai_parser:test:${Date.now()}`;

            // Reject empty prompts early — write an error record so UI subscribers
            // surface a clear message rather than silently dropping the event
            if (!prompt) {
                StorageEngine.dispatchRAMAction({
                    action: 'create_memory',
                    memory_uid: replyToRamKey,
                    payload: {
                        prompt,
                        text: '',
                        raw_response: '',
                        parser_batches: [],
                        status: 'error',
                        error_message: 'Prompt is required for send_gateway.',
                        finished_at: Date.now(),
                    },
                    classifications: ['system:dev', 'system:ai_parser'],
                });
                return;
            }

            const preferredSdk =
                typeof preallocated_memory?.sdk === 'string'
                    ? (preallocated_memory.sdk as SDKProvider)
                    : (AIConfigManager.getActiveSDK() ?? 'openai');

            const preferredModel =
                typeof preallocated_memory?.model === 'string'
                    ? preallocated_memory.model
                    : (AIConfigManager.getActiveModel() ?? 'gpt-4o-mini');

            // Reuse a pre-allocated session or create a fresh one
            const sessionId =
                typeof preallocated_memory?.session_id === 'string'
                    ? preallocated_memory.session_id
                    : await this.createSession(preferredSdk, preferredModel);

            await this.sendToSession(sessionId, prompt, replyToRamKey);
        });

        this.isRouteBound = true;
    }

    // ── Session API ───────────────────────────────────────────────────────────

    /** Creates a new isolated session bound to a specific SDK + model. */
    async createSession(sdk: SDKProvider, model: string): Promise<string> {
        return AISessionManager.create(sdk, model);
    }

    /** Closes and removes a session from the active session map. */
    closeSession(sessionId: string): void {
        AISessionManager.close(sessionId);
    }

    /**
     * Returns read-only snapshots for all active sessions.
     * Intended for Dev Menu monitoring panels — not for runtime logic.
     */
    listSessions(): AISessionSnapshot[] {
        return AISessionManager.list();
    }

    /**
     * Sends a prompt to an existing session and streams the response into RAM.
     *
     * Config is snapshotted at call time (AIConfigManager.get()) so any
     * in-flight config changes do not affect the current request.
     */
    async sendToSession(sessionId: string, prompt: string, reply_to_ram_key: string): Promise<void> {
        const session = AISessionManager.get(sessionId);
        if (!session) throw new Error(`Session ${sessionId} not found.`);
        await _sendToSession(session, prompt, reply_to_ram_key, AIConfigManager.get(), () =>
            HealthProbe.ensure(),
        );
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
