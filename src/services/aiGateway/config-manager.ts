/**
 * AIConfigManager
 *
 * Single source of truth for gateway configuration state.
 *
 * Responsibilities:
 *  - Load + validate `gateway.json` from disk on boot via FSEngine
 *  - Expose typed read/write API for SDK, model, and API key changes
 *  - Auto-persist every mutation back to disk
 *  - Mirror the current config into RAM so UI components can subscribe
 *    reactively without polling this module directly
 *
 * RAM key: `system:ai_gateway_config`
 *
 * Design notes:
 *  - `load()` is intentionally non-throwing. If the file is missing or
 *    malformed, in-memory defaults are kept and the file is NOT overwritten
 *    (preserving any partial user edits that may just have a parse error).
 *  - All setters call `persist()` immediately, so there is no "dirty" state.
 *  - Deep-copy is used on every read to prevent callers from aliasing
 *    internal state.
 */

import { FSEngine } from '../fs-engine';
import { KernelEngine } from '../kernel-engine';
import { AIGatewayConfigSchema, type AIGatewayConfig } from '../../schemas/ai-gateway';
import type { AIGatewayModel } from '../../schemas/ai-gateway';
import type { AIProvider, SDKProvider } from '#/schemas/ai';

const GATEWAY_CONFIG_FILE = 'gateway.json';
const MEMORY_UID = 'system:ai_gateway_config';

const DEFAULT_CONFIG: AIGatewayConfig = {
    version: 2,
    active_provider: null,
    active_sdk: null,
    active_model: null,
    providers: {
        openai: undefined,
        google: undefined,
        anthropic: undefined,
    },
    sdks: {
        openai: undefined,
        google: undefined,
        anthropic: undefined,
    },
};

class AIConfigManagerSingleton {
    private config: AIGatewayConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

    // ── Boot ──────────────────────────────────────────────────────────────────

    /**
     * Ensures `gateway.json` exists on disk, reads it, and validates it with
     * AIGatewayConfigSchema (Zod). Must be called once during app boot before
     * any reads or writes.
     *
     * On parse failure the internal defaults remain active, keeping the app
     * functional. The bad config file is left untouched so the user can fix it.
     */
    async load(): Promise<void> {
        const ensured = await FSEngine.ensureFile(GATEWAY_CONFIG_FILE, {
            version: 2,
            active_provider: null,
            active_sdk: null,
            active_model: null,
            providers: {},
            sdks: {},
        });

        if (!ensured) {
            console.warn('[AIConfigManager] Failed to ensure gateway.json. Running with RAM fallback.');
        }

        const raw = await FSEngine.readFile(GATEWAY_CONFIG_FILE);
        const parsed = AIGatewayConfigSchema.safeParse(raw);

        if (parsed.success) {
            this.config = parsed.data;
        } else {
            console.warn(
                '[AIConfigManager] gateway.json parse failed, keeping defaults.',
                parsed.error.issues,
            );
        }

        this.syncToRAM();
    }

    // ── Read API ──────────────────────────────────────────────────────────────

    /** Returns a deep copy so callers cannot accidentally mutate internal state. */
    get(): AIGatewayConfig {
        return JSON.parse(JSON.stringify(this.config));
    }

    getActiveProvider(): AIProvider | null {
        return this.config.active_provider;
    }

    getActiveSDK(): SDKProvider | null {
        return this.config.active_provider;
    }

    getActiveModel(): string | null {
        return this.config.active_model;
    }

    // ── Write API ─────────────────────────────────────────────────────────────

    /**
     * Changes the active SDK. If the currently selected model does not exist
     * in the new SDK's model list, the active model is cleared to prevent
     * a stale model ID from reaching the gateway server.
     */
    async setActiveProvider(provider: AIProvider | null): Promise<boolean> {
        this.config.active_provider = provider;
        this.config.active_sdk = provider;
        if (provider && this.config.active_model) {
            const models = this.config.providers[provider]?.models ?? [];
            const stillValid = models.some((m) => m.id === this.config.active_model);
            if (!stillValid) this.config.active_model = null;
        }
        return this.persist();
    }

    async setActiveSDK(sdk: SDKProvider | null): Promise<boolean> {
        return this.setActiveProvider(sdk);
    }

    async setActiveModel(model: string | null): Promise<boolean> {
        this.config.active_model = model;
        return this.persist();
    }

    /**
     * Saves an API key for an SDK. Trims surrounding whitespace to avoid
     * accidental invalid keys from copy-paste. Creates the SDK entry if absent.
     */
    async setProviderApiKey(provider: AIProvider, apiKey: string): Promise<boolean> {
        if (!this.config.providers[provider]) {
            this.config.providers[provider] = { api_key: '', models: [] };
        }
        this.config.providers[provider]!.api_key = apiKey.trim();
        this.config.sdks[provider] = this.config.providers[provider];
        return this.persist();
    }

    async setSDKApiKey(sdk: SDKProvider, apiKey: string): Promise<boolean> {
        return this.setProviderApiKey(sdk, apiKey);
    }

    /**
     * Caches a freshly fetched model list for an SDK.
     * Called after a successful /models fetch from the gateway sidecar so the
     * list is available on next boot without re-fetching.
     */
    async updateProviderModels(provider: AIProvider, models: AIGatewayModel[]): Promise<boolean> {
        if (!this.config.providers[provider]) {
            this.config.providers[provider] = { api_key: '', models: [] };
        }
        this.config.providers[provider]!.models = models as any;
        this.config.sdks[provider] = this.config.providers[provider];
        return this.persist();
    }

    async updateSDKModels(sdk: SDKProvider, models: AIGatewayModel[]): Promise<boolean> {
        return this.updateProviderModels(sdk, models);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    /**
     * Writes current config to disk and mirrors it to RAM.
     * If the disk write fails, RAM state is still updated so the current
     * session remains consistent — changes just won't survive an app restart.
     */
    async persist(): Promise<boolean> {
        const saved = await FSEngine.saveFile(GATEWAY_CONFIG_FILE, this.config);
        if (!saved) {
            console.warn('[AIConfigManager] Failed to persist gateway.json. Keeping RAM state only.');
        }
        this.syncToRAM();
        return saved;
    }

    /**
     * Pushes the current config snapshot to the RAM store.
     * UI components subscribed to `system:ai_gateway_config` receive live
     * updates without holding a direct reference to this module.
     */
    syncToRAM(): void {
        this.config.active_sdk = this.config.active_provider;
        this.config.sdks = {
            openai: this.config.providers.openai,
            google: this.config.providers.google,
            anthropic: this.config.providers.anthropic,
        };
        KernelEngine.updateMemory(MEMORY_UID, JSON.parse(JSON.stringify(this.config)));
    }
}

export const AIConfigManager = new AIConfigManagerSingleton();
