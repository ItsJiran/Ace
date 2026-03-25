/**
 * HealthProbe
 *
 * Manages gateway sidecar URL discovery and health monitoring.
 *
 * Responsibilities:
 *  - Probe a single URL to verify the sidecar is reachable and passes the
 *    `gateway_name` identity check (to avoid accidentally hitting an unrelated
 *    HTTP service on the same port)
 *  - Radar-scan a port range in parallel when the default URL is unreachable
 *  - Re-verify the active URL on-demand (`ensure()`) before every outbound call
 *  - Write sidecar runtime status to RAM so UI panels reflect online/offline
 *    state without coupling directly to this module
 *
 * RAM key: `system:ai_gateway_runtime`
 *
 * Port strategy:
 *  - Default port is 8888. If unreachable, scan 8888–8930 in parallel.
 *  - All radar-scan probes share the same HEALTH_TIMEOUT_MS clock window via
 *    Promise.all, so a 42-port scan typically completes within ~1.5 s.
 *  - The current port is preferred when it is still alive (avoids unnecessary
 *    URL churn between calls).
 *
 * Identity check:
 *  The /health endpoint must return `{ ok: true, gateway_name: "ace-sdk-gateway-server" }`.
 *  Any other HTTP server on that port is silently rejected.
 */

import { StorageEngine } from '../storageEngine';
import type { AIGatewaySidecarHealthResult, AIGatewayRadarScanResult } from '../../schemas/ai_gateway';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8888';
const GATEWAY_SERVER_NAME = 'ace-sdk-gateway-server';
const RUNTIME_MEMORY_UID = 'system:ai_gateway_runtime';

/** Tight timeout for individual health probes. Keeps radar scans fast. */
const HEALTH_TIMEOUT_MS = 1500;

class HealthProbeSingleton {
    /** The currently active gateway base URL. Updated whenever a probe succeeds. */
    private gatewayServerUrl = DEFAULT_BASE_URL;

    // ── Public API ────────────────────────────────────────────────────────────

    getBaseUrl(): string {
        return this.gatewayServerUrl;
    }

    getDefaultUrl(): string {
        return DEFAULT_BASE_URL;
    }

    /**
     * Probes the given URL (or the cached active URL if omitted).
     * Also persists the result to RAM so DevMenu / status panels stay current.
     */
    async probe(baseUrl?: string): Promise<AIGatewaySidecarHealthResult> {
        return this.probeSidecar(baseUrl ?? this.gatewayServerUrl, true);
    }

    /**
     * Scans a port range in parallel and returns all verified gateway ports.
     *
     * - All probes run concurrently (Promise.all) — a 42-port scan completes
     *   in ~1× HEALTH_TIMEOUT_MS wall-clock time.
     * - `persistRuntime` is false during individual sub-probes to avoid a
     *   flood of concurrent RAM writes; one final write is made for the winner.
     * - Current port is preferred if it is still alive (stable URL).
     */
    async radarScan(startPort = 8888, endPort = 8930): Promise<AIGatewayRadarScanResult> {
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

        // Prefer the current port if still alive, otherwise take the first winner
        let activeBaseUrl: string | null = null;
        const currentPort = this.extractPort(this.gatewayServerUrl);
        if (foundPorts.includes(currentPort)) {
            activeBaseUrl = this.gatewayServerUrl;
        } else if (foundPorts.length > 0) {
            activeBaseUrl = `http://127.0.0.1:${foundPorts[0]}`;
            this.gatewayServerUrl = activeBaseUrl;
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

        // Write a single synthetic health record to RAM for the winning port
        if (activeBaseUrl) {
            const syntheticHealth: AIGatewaySidecarHealthResult = {
                ok: true,
                base_url: activeBaseUrl,
                status_code: 200,
                latency_ms: 0,
                gateway_name: GATEWAY_SERVER_NAME,
            };
            this.syncRuntimeToRAM(syntheticHealth, foundPorts);
        } else {
            // Write offline status so UI panels don't show stale "online"
            this.syncRuntimeToRAM(
                {
                    ok: false,
                    base_url: this.gatewayServerUrl,
                    status_code: null,
                    latency_ms: 0,
                    error_message: result.error_message,
                },
                [],
            );
        }

        return result;
    }

    /**
     * Re-verifies the active gateway URL — called before every outbound HTTP
     * request to ensure the sidecar has not moved or restarted on a new port.
     *
     * Fallback chain:
     *  1. Re-probe current cached URL
     *  2. If different from default, also try the default URL (8888)
     *  3. If still unreachable, run a full radar scan (8888–8930)
     *
     * Returns the active base URL, or null if the sidecar is completely unreachable.
     */
    async ensure(): Promise<string | null> {
        const current = await this.probeSidecar(this.gatewayServerUrl, true);
        if (current.ok) return current.base_url;

        if (this.gatewayServerUrl !== DEFAULT_BASE_URL) {
            const fallback = await this.probeSidecar(DEFAULT_BASE_URL, true);
            if (fallback.ok) return fallback.base_url;
        }

        const scan = await this.radarScan(8888, 8930);
        return scan.active_base_url;
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    /**
     * Low-level single-URL probe.
     *
     * @param persistRuntime  If true, writes the result to RAM immediately.
     *                        Pass false during parallel radar scans to avoid
     *                        flooding the RAM store with concurrent writes.
     */
    private async probeSidecar(
        baseUrl: string,
        persistRuntime: boolean,
    ): Promise<AIGatewaySidecarHealthResult> {
        const startedAt = Date.now();
        try {
            const response = await fetch(`${baseUrl}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
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

            // Identity check: reject unrelated HTTP services on the same port
            const verified = data.ok === true && data.gateway_name === GATEWAY_SERVER_NAME;
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
                    : data.error_message || 'Health endpoint responded but identity check failed.',
            };

            if (verified) this.gatewayServerUrl = verifiedBaseUrl;
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

    /**
     * Writes sidecar runtime status to RAM.
     * UI panels subscribed to `system:ai_gateway_runtime` receive live
     * online/offline updates without coupling to this module directly.
     */
    private syncRuntimeToRAM(health: AIGatewaySidecarHealthResult, foundPorts: number[]): void {
        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: RUNTIME_MEMORY_UID,
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

export const HealthProbe = new HealthProbeSingleton();
