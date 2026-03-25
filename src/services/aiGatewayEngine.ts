import { StorageEngine } from './storageEngine';
import { EventBus } from './eventEngine';
import { parseAIStreamChunk } from './aiParser';
import { FSEngine } from './fsEngine';
import type { Interaction } from '../schemas/events';
import {
    AIGatewayConfigSchema,
    type AIGatewayConfig,
    type AIGatewayResponseResult,
    type AIGatewayModel,
    type AIGatewayFetchModelsResult,
    type AIGatewaySidecarHealthResult,
    type AIGatewayRadarScanResult,
} from '../schemas/ai_gateway';

type SDKProvider = 'openai' | 'google' | 'anthropic';

export interface AISession {
    sessionId: string;
    sdk: SDKProvider;
    model: string;
    
    // The specific RAM key this session is currently streaming into
    activeOutputRamKey?: string; 
    
    // Parser State (Per-Session Buffer)
    activeEventBuffer: string;
    isInsideEventBlock: boolean;
    
    status: 'idle' | 'connected' | 'streaming' | 'error';
    
    // Future: WebSocket instance
    // socket?: WebSocket;
}

/**
 * AIGatewayEngineSingleton
 * Role: Orchestrates communication between the app and the `sdk-gateway-server` sidecar.
 * Manages per-SDK configuration (OpenAI, Google, Anthropic) with API keys and model lists.
 * The gateway server handles all provider endpoint logic internally.
 */
class AIGatewayEngineSingleton {
    public readonly memory_uid = 'system:ai_gateway_config';
    public readonly runtime_memory_uid = 'system:ai_gateway_runtime';
    private readonly gateway_config_file = 'gateway.json';
    private readonly gateway_server_name = 'ace-sdk-gateway-server';
    private readonly default_gateway_server_url = 'http://127.0.0.1:8888';
    private gateway_server_url = this.default_gateway_server_url;

    private isBooted = false;
    private gatewayConfig: AIGatewayConfig = {
        version: 2,
        active_sdk: null,
        active_model: null,
        sdks: {
            openai: undefined,
            google: undefined,
            anthropic: undefined,
        },
    };

    // Active Sessions Map (sessionId -> AISession)
    private sessions = new Map<string, AISession>();

    async boot() {
        if (this.isBooted) return;

        const ensured = await FSEngine.ensureFile(this.gateway_config_file, {
            version: 2,
            active_sdk: null,
            active_model: null,
            sdks: {},
        });

        if (!ensured) {
            console.warn('[AIGatewayEngine] Failed to ensure gateway.json. Running with RAM fallback.');
        }

        const raw = await FSEngine.readFile(this.gateway_config_file);
        const parsed = AIGatewayConfigSchema.safeParse(raw);

        if (parsed.success) {
            this.gatewayConfig = parsed.data;
        } else {
            console.warn('[AIGatewayEngine] gateway.json parse failed, keeping defaults in RAM only (not overwriting file).', parsed.error.issues);
        }

        this.syncConfigToRAM();
        
        // Try to find and connect to the gateway server
        // First try the default port, then radar scan if that fails
        const healthCheck = await this.healthCheckSidecar();
        if (!healthCheck.ok) {
            console.warn('[AIGatewayEngine] Failed to connect to default gateway URL. Running radar scan...');
            const radar = await this.radarScanPorts(8888, 8930);
            if (radar.active_base_url) {
                console.info(`[AIGatewayEngine] Found gateway at ${radar.active_base_url}`);
                this.gateway_server_url = radar.active_base_url;
            } else {
                console.warn('[AIGatewayEngine] Gateway server not found. App can still run, but AI features will be unavailable until gateway is started.');
            }
        }
        
        this.isBooted = true;
    }

    getGatewayBaseUrl(): string {
        return this.gateway_server_url;
    }

    async healthCheckSidecar(baseUrl?: string): Promise<AIGatewaySidecarHealthResult> {
        const targetBaseUrl = baseUrl ?? this.gateway_server_url;
        return this.probeSidecar(targetBaseUrl, true);
    }

    private async probeSidecar(baseUrl: string, persistRuntime: boolean): Promise<AIGatewaySidecarHealthResult> {
        const startedAt = Date.now();

        try {
            const response = await fetch(`${baseUrl}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(1500),
            });

            const latency = Date.now() - startedAt;
            if (!response.ok) {
                const errorText = await response.text();
                const result: AIGatewaySidecarHealthResult = {
                    ok: false,
                    base_url: baseUrl,
                    status_code: response.status,
                    latency_ms: latency,
                    error_message: `${response.status}: ${errorText}`,
                };
                if (persistRuntime) {
                    this.syncRuntimeToRAM(result, []);
                }
                return result;
            }

            const data = await response.json() as {
                ok?: boolean;
                gateway_name?: string;
                gateway_contract_version?: string;
                base_url?: string;
                error_message?: string;
            };

            const verified = data.ok === true && data.gateway_name === this.gateway_server_name;
            const verifiedBaseUrl = data.base_url || baseUrl;
            const result: AIGatewaySidecarHealthResult = {
                ok: verified,
                base_url: verifiedBaseUrl,
                status_code: response.status,
                latency_ms: latency,
                gateway_name: data.gateway_name,
                gateway_contract_version: data.gateway_contract_version,
                error_message: verified ? undefined : (data.error_message || 'Health endpoint responded but verifier mismatch.'),
            };

            if (verified) {
                this.gateway_server_url = verifiedBaseUrl;
            }

            if (persistRuntime) {
                this.syncRuntimeToRAM(result, verified ? [this.extractPort(verifiedBaseUrl)] : []);
            }
            return result;
        } catch (error) {
            const result: AIGatewaySidecarHealthResult = {
                ok: false,
                base_url: baseUrl,
                status_code: null,
                latency_ms: Date.now() - startedAt,
                error_message: error instanceof Error ? error.message : String(error),
            };
            if (persistRuntime) {
                this.syncRuntimeToRAM(result, []);
            }
            return result;
        }
    }

    async radarScanPorts(startPort = 8888, endPort = 8930): Promise<AIGatewayRadarScanResult> {
        const ports: number[] = [];
        for (let port = startPort; port <= endPort; port += 1) {
            ports.push(port);
        }

        const checks = await Promise.all(ports.map(async (port) => {
            const baseUrl = `http://127.0.0.1:${port}`;
            const health = await this.probeSidecar(baseUrl, false);
            return { port, health };
        }));

        const foundPorts = checks
            .filter((entry) => entry.health.ok)
            .map((entry) => entry.port);

        let activeBaseUrl: string | null = null;
        const currentPort = this.extractPort(this.gateway_server_url);
        if (foundPorts.includes(currentPort)) {
            activeBaseUrl = this.gateway_server_url;
        } else if (foundPorts.length > 0) {
            activeBaseUrl = `http://127.0.0.1:${foundPorts[0]}`;
            this.gateway_server_url = activeBaseUrl;
        }

        const result: AIGatewayRadarScanResult = {
            ok: foundPorts.length > 0,
            scanned_range: [startPort, endPort],
            found_ports: foundPorts,
            active_base_url: activeBaseUrl,
            verified_by: 'GET /health + gateway_name',
            error_message: foundPorts.length > 0 ? undefined : 'No verified sdk-gateway-server found in scanned range.',
        };

        if (activeBaseUrl) {
            const health: AIGatewaySidecarHealthResult = {
                ok: true,
                base_url: activeBaseUrl,
                status_code: 200,
                latency_ms: 0,
                gateway_name: this.gateway_server_name,
            };
            this.syncRuntimeToRAM(health, foundPorts);
        }

        return result;
    }

    private async ensureGatewayServerUrl(): Promise<string | null> {
        const current = await this.healthCheckSidecar(this.gateway_server_url);
        if (current.ok) return current.base_url;

        if (this.gateway_server_url !== this.default_gateway_server_url) {
            const fallback = await this.healthCheckSidecar(this.default_gateway_server_url);
            if (fallback.ok) return fallback.base_url;
        }

        const scan = await this.radarScanPorts(8888, 8930);
        return scan.active_base_url;
    }

    getConfig(): AIGatewayConfig {
        return JSON.parse(JSON.stringify(this.gatewayConfig));
    }

    getActiveSDK(): SDKProvider | null {
        return this.gatewayConfig.active_sdk;
    }

    getActiveModel(): string | null {
        return this.gatewayConfig.active_model;
    }

    async setActiveSDK(sdk: SDKProvider | null): Promise<boolean> {
        this.gatewayConfig.active_sdk = sdk;
        // Reset model when changing SDK unless it exists in new SDK
        if (sdk && this.gatewayConfig.active_model) {
            const models = this.gatewayConfig.sdks[sdk]?.models ?? [];
            if (!models.find((m) => m.id === this.gatewayConfig.active_model)) {
                this.gatewayConfig.active_model = null;
            }
        }
        await this.persistConfig();
        return true;
    }

    async setActiveModel(model: string | null): Promise<boolean> {
        this.gatewayConfig.active_model = model;
        await this.persistConfig();
        return true;
    }

    async setSDKApiKey(sdk: SDKProvider, apiKey: string): Promise<boolean> {
        if (!this.gatewayConfig.sdks[sdk]) {
            this.gatewayConfig.sdks[sdk] = { api_key: '', models: [] };
        }
        this.gatewayConfig.sdks[sdk]!.api_key = apiKey.trim();
        await this.persistConfig();
        return true;
    }

    /**
     * Fetch available models for an SDK by calling the gateway server.
     * Also serves as a connectivity/auth test: if models come back, SDK is working.
     */
    async fetchModels(sdk: SDKProvider): Promise<AIGatewayFetchModelsResult> {
        const sdkConfig = this.gatewayConfig.sdks[sdk];
        if (!sdkConfig || !sdkConfig.api_key) {
            return {
                ok: false,
                models: [],
                error_message: `${sdk} API key not configured.`,
            };
        }

        try {
            const baseUrl = await this.ensureGatewayServerUrl();
            if (!baseUrl) {
                return {
                    ok: false,
                    models: [],
                    error_message: 'SDK gateway sidecar not found. Please run radar scan / health check.',
                };
            }

            const response = await fetch(`${baseUrl}/models/${sdk}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${sdkConfig.api_key}`,
                    'Content-Type': 'application/json',
                },
                signal: AbortSignal.timeout(9000),
            });

            if (!response.ok) {
                const errorText = await response.text();
                return {
                    ok: false,
                    models: [],
                    error_message: `${response.status}: ${errorText}`,
                };
            }

            const data = await response.json() as { models?: AIGatewayModel[] };
            const models = data.models ?? [];

            // Persist fetched models
            if (this.gatewayConfig.sdks[sdk]) {
                this.gatewayConfig.sdks[sdk]!.models = models;
                await this.persistConfig();
            }

            return {
                ok: true,
                models,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                ok: false,
                models: [],
                error_message: errorMessage,
            };
        }
    }

    /**
     * Test an SDK + model combination by calling the gateway server with a test prompt.
     */
    async testResponse(sdk: SDKProvider, model: string, prompt: string): Promise<AIGatewayResponseResult> {
        const sdkConfig = this.gatewayConfig.sdks[sdk];
        if (!sdkConfig || !sdkConfig.api_key) {
            return {
                ok: false,
                latency_ms: 0,
                status_code: null,
                response_text: '',
                error_message: `${sdk} API key not configured.`,
            };
        }

        try {
            const baseUrl = await this.ensureGatewayServerUrl();
            if (!baseUrl) {
                return {
                    ok: false,
                    latency_ms: 0,
                    status_code: null,
                    response_text: '',
                    error_message: 'SDK gateway sidecar not found. Please run radar scan / health check.',
                };
            }

            const startTime = Date.now();
            const response = await fetch(`${baseUrl}/test/${sdk}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${sdkConfig.api_key}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model,
                    prompt: prompt || 'ping',
                }),
                signal: AbortSignal.timeout(9000),
            });

            const latency = Date.now() - startTime;

            if (!response.ok) {
                const errorText = await response.text();
                return {
                    ok: false,
                    latency_ms: latency,
                    status_code: response.status,
                    response_text: '',
                    error_message: `${response.status}: ${errorText}`,
                };
            }

            const data = await response.json() as { response?: string };
            const responseText = data.response ?? '';

            return {
                ok: true,
                latency_ms: latency,
                status_code: response.status,
                response_text: responseText,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                ok: false,
                latency_ms: 0,
                status_code: null,
                response_text: '',
                error_message: errorMessage,
            };
        }
    }

    /**
     * Create a new isolated session connected to a specific SDK + model.
     * This allows multiple tabs/agents to have independent conversation streams.
     */
    async createSession(sdk: SDKProvider, model: string): Promise<string> {
        const sessionId = `sess-${crypto.randomUUID()}`;
        
        const session: AISession = {
            sessionId,
            sdk,
            model,
            activeEventBuffer: '',
            isInsideEventBlock: false,
            status: 'connected',
        };

        this.sessions.set(sessionId, session);
        console.log(`[AIGatewayEngine] Session ${sessionId} created for ${sdk}/${model}.`);
        
        return sessionId;
    }

    /**
     * Close and cleanup a session.
     */
    closeSession(sessionId: string) {
        if (this.sessions.has(sessionId)) {
            this.sessions.delete(sessionId);
            console.log(`[AIGatewayEngine] Session ${sessionId} closed.`);
        }
    }

    /**
     * Process a chunk of incoming AI stream data for a SPECIFIC session.
     * Separates the conversational text from the ```event blocks using session-local state.
     */
    private handleSessionStreamChunk(sessionId: string, chunk: string, ramKey: string, processUid?: string) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        // Append to session-specific buffer
        const fullStream = session.activeEventBuffer + chunk;
        session.activeEventBuffer = ''; 

        const { events, textToPrint } = parseAIStreamChunk(fullStream);

        // 1. PATHWAY A: Append Conversational Text to RAM
        if (textToPrint) {
            const currentText = StorageEngine.readMemory(ramKey) || '';
            StorageEngine.dispatchRAMAction({
                action: 'update_memory',
                memory_uid: ramKey,
                payload: { text: currentText + textToPrint }
            });
        }

        // 2. PATHWAY B: Handle Events
        events.forEach(event => {
            if (event.is_complete) {
                session.isInsideEventBlock = false;
                
                // Interaction Emission
                const interaction: Interaction = {
                    event_type: 'interaction',
                    window_uid: event.headers.window_uid,
                    process_uid: event.headers.process_uid || processUid,
                    widget_uid: event.headers.widget_uid,
                    action: event.headers.action,
                    sub_action: event.headers.sub_action,
                    payload: JSON.parse(event.raw_payload_buffer || '{}'),
                    
                    // Crucial: Pass session context so the handler knows where to reply!
                    preallocated_memory: {
                        session_id: sessionId,
                        sdk: session.sdk,
                        model: session.model,
                    }
                };

                console.log(`[AIGatewayEngine] [${sessionId}] Event Detected: ${interaction.action}`);
                EventBus.emit(interaction);
            } else {
                session.isInsideEventBlock = true;
                
                // Reconstruct buffer for next chunk
                const h = event.headers;
                const headerLine = `${h.event_type}, ${h.window_uid}, ${h.process_uid || 'null'}, ${h.widget_uid || 'null'}, ${h.action}, ${h.sub_action}`;
                session.activeEventBuffer = `\n\`\`\`event\n${headerLine}\n${event.raw_payload_buffer}`;
            }
        });
    }

    /**
     * Send a prompt to a specific session.
     * In Phase 4, this simulates a streaming response for testing.
     */
    async sendToSession(sessionId: string, prompt: string, reply_to_ram_key: string) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found.`);
        }

        console.log(`[AIGatewayEngine] [${sessionId}] Sending: "${prompt}"`);
        session.status = 'streaming';
        session.activeOutputRamKey = reply_to_ram_key;

        // PRE-ALLOCATION
        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: reply_to_ram_key,
            payload: { text: '', status: 'streaming', session_id: sessionId }
        });

        // SIMULATION MODE (Phase 4 Mock)
        const chunks = [
            "Hello! I am reading your request via session " + sessionId + ".",
            " I will help you with that.\n\n",
            "```event\ninteraction, main_window, null, null, open, open_widget\n",
            "{\n  \"widget_name\": \"calendar_view\"\n}\nend_event\n```\n",
            "There you go! I have opened the calendar for you."
        ];

        for (const chunk of chunks) {
            await new Promise(resolve => setTimeout(resolve, 300));
            this.handleSessionStreamChunk(sessionId, chunk, reply_to_ram_key);
        }

        // Finalize state
        session.status = 'connected';
        StorageEngine.dispatchRAMAction({
            action: 'update_memory',
            memory_uid: reply_to_ram_key,
            payload: { status: 'completed' }
        });
    }

    private async persistConfig() {
        const saved = await FSEngine.saveFile(this.gateway_config_file, this.gatewayConfig);
        if (!saved) {
            console.warn('[AIGatewayEngine] Failed to persist gateway.json. Keeping RAM state only.');
        }

        this.syncConfigToRAM();
        return saved;
    }

    private syncConfigToRAM() {
        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: this.memory_uid,
            payload: JSON.parse(JSON.stringify(this.gatewayConfig)),
            classifications: ['system:core', 'system:ai_gateway'],
        });
    }

    private syncRuntimeToRAM(health: AIGatewaySidecarHealthResult, foundPorts: number[]) {
        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: this.runtime_memory_uid,
            payload: {
                base_url: health.base_url,
                status: health.ok ? 'online' : 'offline',
                status_code: health.status_code,
                latency_ms: health.latency_ms,
                gateway_name: health.gateway_name,
                gateway_contract_version: health.gateway_contract_version,
                found_ports: foundPorts,
                last_error_message: health.error_message ?? null,
                last_checked_at: Date.now(),
            },
            classifications: ['system:core', 'system:ai_gateway'],
        });
    }

    private extractPort(baseUrl: string): number {
        try {
            return Number(new URL(baseUrl).port || 80);
        } catch {
            return 0;
        }
    }
}

export const AIGatewayEngine = new AIGatewayEngineSingleton();
