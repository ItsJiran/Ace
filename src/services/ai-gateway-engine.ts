/**
 */

// import { registerSendGatewayRoute } from './aiGateway/sendGatewayRoute';
import { AIConfigManager } from './aiGateway/config-manager';
import { HealthProbe } from './aiGateway/health-probe';
import { fetchModels as _fetchModels, testResponse as _testResponse } from './aiGateway/provider-client';
import { KernelEngine } from './kernel-engine';

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

    private registerTerminationHooks() {
        if (this.isTerminationHookBound) return;

        KernelEngine.registerTerminationHandler('ai-gateway-engine', ({ record }) => {

            const metadata = (record.metadata && typeof record.metadata === 'object')
                ? (record.metadata as Record<string, unknown>)
                : undefined;

            const payload = (record.payload && typeof record.payload === 'object')
                ? (record.payload as Record<string, unknown>)
                : undefined;

            const sessionUid = typeof metadata?.thread_id === 'string' 
                ? metadata.thread_id
                : typeof payload?.thread_id === 'string'
                    ? payload.thread_id
                    : undefined;
            
            if (!sessionUid) return;
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

    getActiveProvider(): AIProvider | null {
        return AIConfigManager.getActiveProvider();
    }

    getActiveModel(): string | null {
        return AIConfigManager.getActiveModel();
    }

    async setActiveProvider(provider: AIProvider | null): Promise<boolean> {
        return AIConfigManager.setActiveProvider(provider);
    }

    async setActiveModel(model: string | null): Promise<boolean> {
        return AIConfigManager.setActiveModel(model);
    }

    async setProviderApiKey(provider: AIProvider, apiKey: string): Promise<boolean> {
        return AIConfigManager.setProviderApiKey(provider, apiKey);
    }

    // ── Provider calls ────────────────────────────────────────────────────────

    /**
     * Fetches the available model list for a given provider from the gateway sidecar.
     * On success, the list is persisted into config via AIConfigManager so it
     * survives app restarts without re-fetching.
     */
    async fetchModels(provider: AIProvider): Promise<AIGatewayFetchModelsResult> {
        const result = await _fetchModels(provider, AIConfigManager.get(), () => HealthProbe.ensure());
        if (result.ok && result.models.length > 0) {
            await AIConfigManager.updateProviderModels(provider, result.models);
        }
        return result;
    }

    /**
     * Sends a single non-streaming test prompt.
     * Used by Settings panel to verify a provider + model before saving.
     */
    async testResponse(provider: AIProvider, model: string, prompt: string): Promise<AIGatewayResponseResult> {
        return _testResponse(provider, model, prompt, AIConfigManager.get(), () => HealthProbe.ensure());
    }

}

export const AIGatewayEngine = new AIGatewayEngineSingleton();
