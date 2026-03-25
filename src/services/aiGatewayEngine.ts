import { StorageEngine } from './storageEngine';
import { EventBus } from './eventEngine';
import { FSEngine } from './fsEngine';
import { AISessionManager } from './aiGateway/sessionManager';
import { sendToSession as _sendToSession } from './aiGateway/httpClient';
import {
    AIGatewayConfigSchema,
    type AIGatewayConfig,
    type AIGatewayResponseResult,
    type AIGatewayModel,
    type AIGatewayFetchModelsResult,
    type AIGatewaySidecarHealthResult,
    type AIGatewayRadarScanResult,
} from '../schemas/ai_gateway';

export type { SDKProvider, AISession, AISessionSnapshot } from './aiGateway/types';
import type { SDKProvider, AISessionSnapshot } from './aiGateway/types';

/**
 * AIGatewayEngineSingleton
 *
 * Responsibilities: config loading/persistence, boot, health check, radar scan,
 * EventBus routing for `send_gateway`, and public API surface.
 *
 * Session lifecycle, stream chunk parsing, and HTTP streaming are handled by
 * sub-modules in ./aiGateway/.
 */
class AIGatewayEngineSingleton {
    public readonly memory_uid = 'system:ai_gateway_config';
    public readonly runtime_memory_uid = 'system:ai_gateway_runtime';

    private readonly gateway_config_file = 'gateway.json';
    private readonly gateway_server_name = 'ace-sdk-gateway-server';
    private readonly default_gateway_server_url = 'http://127.0.0.1:8888';
    private gateway_server_url = this.default_gateway_server_url;

    private isBooted = false;
    private isRouteBound = false;

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

    // ── Boot ─────────────────────────────────────────────────────────────────

    async boot() {
        if (this.isBooted) return;

        this.bindEventRoutes();

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
            console.warn(
                '[AIGatewayEngine] gateway.json parse failed, keeping defaults in RAM only (not overwriting file).',
                parsed.error.issues,
            );
        }

        this.syncConfigToRAM();

        const healthCheck = await this.healthCheckSidecar();
        if (!healthCheck.ok) {
            console.warn('[AIGatewayEngine] Failed to connect to default gateway URL. Running radar scan...');
            const radar = await this.radarScanPorts(8888, 8930);
            if (radar.active_base_url) {
                console.info(`[AIGatewayEngine] Found gateway at ${radar.active_base_url}`);
                this.gateway_server_url = radar.active_base_url;
            } else {
                console.warn(
                    '[AIGatewayEngine] Gateway server not found. AI features unavailable until gateway is started.',
                );
            }
        }

        this.isBooted = true;
    }

    // ── EventBus route ────────────────────────────────────────────────────────

    private bindEventRoutes() {
        if (this.isRouteBound) return;

        EventBus.registerProcessRoute('send_gateway', async ({ payload, preallocated_memory }) => {
            const prompt =
                typeof payload?.prompt === 'string' ? payload.prompt.trim() : '';
            const replyToRamKey =
                typeof preallocated_memory?.reply_to_ram_key === 'string'
                    ? preallocated_memory.reply_to_ram_key
                    : typeof payload?.reply_to_ram_key === 'string'
                        ? payload.reply_to_ram_key
                        : `system:ai_parser:test:${Date.now()}`;

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
                    : (this.gatewayConfig.active_sdk ?? 'openai');
            const preferredModel =
                typeof preallocated_memory?.model === 'string'
                    ? preallocated_memory.model
                    : (this.gatewayConfig.active_model ?? 'gpt-4o-mini');

            const sessionId =
                typeof preallocated_memory?.session_id === 'string'
                    ? preallocated_memory.session_id
                    : await this.createSession(preferredSdk, preferredModel);

            await this.sendToSession(sessionId, prompt, replyToRamKey);
        });

        this.isRouteBound = true;
    }

    // ── Session API ───────────────────────────────────────────────────────────

    /** Create a new isolated session bound to a specific SDK + model. */
    async createSession(sdk: SDKProvider, model: string): Promise<string> {
        return AISessionManager.create(sdk, model);
    }

    /** Close and remove a session. */
    closeSession(sessionId: string): void {
        AISessionManager.close(sessionId);
    }

    /** Read-only snapshots for dev monitoring UI. */
    listSessions(): AISessionSnapshot[] {
        return AISessionManager.list();
    }

    /** Send a prompt to an existing session, streaming the response into RAM. */
    async sendToSession(sessionId: string, prompt: string, reply_to_ram_key: string): Promise<void> {
        const session = AISessionManager.get(sessionId);
        if (!session) throw new Error(`Session ${sessionId} not found.`);
        await _sendToSession(session, prompt, reply_to_ram_key, this.gatewayConfig, () =>
            this.ensureGatewayServerUrl(),
        );
    }

    // ── Health / Discovery ────────────────────────────────────────────────────

    getGatewayBaseUrl(): string {
        return this.gateway_server_url;
    }

    async healthCheckSidecar(baseUrl?: string): Promise<AIGatewaySidecarHealthResult> {
        return this.probeSidecar(baseUrl ?? this.gateway_server_url, true);
    }

    private async probeSidecar(
        baseUrl: string,
        persistRuntime: boolean,
    ): Promise<AIGatewaySidecarHealthResult> {
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
                if (persistRuntime) this.syncRuntimeToRAM(result, []);
                return result;
            }

            const data = (await response.json()) as {
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
                error_message: verified
                    ? undefined
                    : data.error_message || 'Health endpoint responded but verifier mismatch.',
            };

            if (verified) this.gateway_server_url = verifiedBaseUrl;
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
            if (persistRuntime) this.syncRuntimeToRAM(result, []);
            return result;
        }
    }

    async radarScanPorts(startPort = 8888, endPort = 8930): Promise<AIGatewayRadarScanResult> {
        const ports: number[] = [];
        for (let port = startPort; port <= endPort; port += 1) ports.push(port);

        const checks = await Promise.all(
            ports.map(async (port) => {
                const baseUrl = `http://127.0.0.1:${port}`;
                const health = await this.probeSidecar(baseUrl, false);
                return { port, health };
            }),
        );

        const foundPorts = checks.filter((e) => e.health.ok).map((e) => e.port);

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
            error_message:
                foundPorts.length > 0
                    ? undefined
                    : 'No verified sdk-gateway-server found in scanned range.',
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

    /** Re-verify the active gateway URL, falling back to default then radar scan. */
    async ensureGatewayServerUrl(): Promise<string | null> {
        const current = await this.healthCheckSidecar(this.gateway_server_url);
        if (current.ok) return current.base_url;

        if (this.gateway_server_url !== this.default_gateway_server_url) {
            const fallback = await this.healthCheckSidecar(this.default_gateway_server_url);
            if (fallback.ok) return fallback.base_url;
        }

        const scan = await this.radarScanPorts(8888, 8930);
        return scan.active_base_url;
    }

    // ── Config API ────────────────────────────────────────────────────────────

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

    // ── Provider calls ────────────────────────────────────────────────────────

    async fetchModels(sdk: SDKProvider): Promise<AIGatewayFetchModelsResult> {
        const sdkConfig = this.gatewayConfig.sdks[sdk];
        if (!sdkConfig?.api_key) {
            return { ok: false, models: [], error_message: `${sdk} API key not configured.` };
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
                return { ok: false, models: [], error_message: `${response.status}: ${errorText}` };
            }

            const data = (await response.json()) as { models?: AIGatewayModel[] };
            const models = data.models ?? [];

            if (this.gatewayConfig.sdks[sdk]) {
                this.gatewayConfig.sdks[sdk]!.models = models;
                await this.persistConfig();
            }

            return { ok: true, models };
        } catch (error) {
            return {
                ok: false,
                models: [],
                error_message: error instanceof Error ? error.message : String(error),
            };
        }
    }

    async testResponse(sdk: SDKProvider, model: string, prompt: string): Promise<AIGatewayResponseResult> {
        const sdkConfig = this.gatewayConfig.sdks[sdk];
        if (!sdkConfig?.api_key) {
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
                body: JSON.stringify({ model, prompt: prompt || 'ping' }),
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

            const data = (await response.json()) as { response?: string };
            return {
                ok: true,
                latency_ms: latency,
                status_code: response.status,
                response_text: data.response ?? '',
            };
        } catch (error) {
            return {
                ok: false,
                latency_ms: 0,
                status_code: null,
                response_text: '',
                error_message: error instanceof Error ? error.message : String(error),
            };
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

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
