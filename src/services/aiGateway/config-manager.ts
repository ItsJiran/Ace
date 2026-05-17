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
import { AIGatewayConfigSchema, type AIGatewayConfig, type AIGatewayModel } from '#/schemas/ai-gateway';

const GATEWAY_CONFIG_FILE = 'gateway.json';
const MEMORY_UID = 'system:ai_gateway_config';

const DEFAULT_CONFIG: AIGatewayConfig = {
    version: 2,
    active_provider: null,
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

class ConfigManagerSingleton {
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

    // ── API ──────────────────────────────────────────────────────────────

    get(): AIGatewayConfig {
        return JSON.parse(JSON.stringify(this.config));
    }

    getByKey<K extends keyof AIGatewayConfig>(key: K): AIGatewayConfig[K] {
        return JSON.parse(JSON.stringify(this.config[key]));
    }

    write(config: Partial<AIGatewayConfig>): Promise<boolean> {
        this.config = {
            ...this.config,
            ...config,
        };
        return this.persist();
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
        KernelEngine.updateMemory(MEMORY_UID, JSON.parse(JSON.stringify(this.config)));
    }
}

export const AIConfigManager = new AIConfigManagerSingleton();
