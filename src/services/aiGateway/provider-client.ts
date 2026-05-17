/**
 * ProviderClient
 *
 * Pure HTTP helpers for non-streaming gateway sidecar endpoints.
 *
 * Responsibilities:
 *  - Fetch the available model list for a given provider from the gateway sidecar
 *  - Send a single non-streaming test prompt to verify a provider + model works
 *
 * Design notes:
 *  - These functions are intentionally pure (no singletons, no side-effects).
 *    They accept a config snapshot and a `getBaseUrl` resolver rather than
 *    importing AIConfigManager or HealthProbe directly — eliminating circular
 *    dependency chains that could arise from the shared singleton graph.
 *  - The caller (AIGatewayEngine) owns the config persistence; this module
 *    only performs the HTTP call and returns a typed result.
 *  - Both functions produce a structured result object (never throw) so callers
 *    can surface meaningful error messages in the UI without try/catch at every
 *    call site.
 */

import type {
    AIGatewayConfig,
    AIGatewayFetchModelsResult,
    AIGatewayModel,
    AIGatewayResponseResult,
} from '../../schemas/ai-gateway';
import type { AIProvider } from '#/schemas/ai';

const FETCH_TIMEOUT_MS = 9000;

/**
 * Calls GET /models/:provider on the gateway sidecar and returns the model list.
 *
 * The returned list is NOT stored here — the caller is responsible for
 * persisting it via AIConfigManager.updateProviderModels().
 *
 * @param provider       Provider to query (openai | google | anthropic)
 * @param gatewayConfig  Config snapshot — only the API key for `provider` is read
 * @param getBaseUrl     Async resolver that returns a verified gateway base URL
 *                       or null if the sidecar is unreachable
 */
export async function fetchModels(
    provider: AIProvider,
    gatewayConfig: AIGatewayConfig,
    getBaseUrl: () => Promise<string | null>,
): Promise<AIGatewayFetchModelsResult> {
    const providerConfig = gatewayConfig.providers[provider];
    if (!providerConfig?.api_key) {
        return { ok: false, models: [], error_message: `${provider} API key not configured.` };
    }

    const baseUrl = await getBaseUrl();
    if (!baseUrl) {
        return {
            ok: false,
            models: [],
            error_message: 'AI gateway sidecar not found. Please run radar scan / health check.',
        };
    }

    try {
        const response = await fetch(`${baseUrl}/models/${provider}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${providerConfig.api_key}`,
                'Content-Type': 'application/json',
            },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return { ok: false, models: [], error_message: `${response.status}: ${errorText}` };
        }

        const data = (await response.json()) as { models?: AIGatewayModel[] };
        return { ok: true, models: data.models ?? [] };
    } catch (error) {
        return {
            ok: false,
            models: [],
            error_message: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * Sends a single non-streaming prompt via POST /test/:provider.
 *
 * Used from the Settings panel to verify that a given provider + model combination
 * is reachable and returns a valid response before the user saves it as active.
 *
 * Latency is measured from request dispatch to full JSON body received
 * (not time-to-first-token, since the /test endpoint is non-streaming).
 *
 * @param provider       Target provider
 * @param model          Model ID string (e.g. "gpt-4o-mini")
 * @param prompt         Test prompt — defaults to "ping" on the server if empty
 * @param gatewayConfig  Config snapshot for API key lookup
 * @param getBaseUrl     Async resolver for a verified gateway base URL
 */
export async function testResponse(
    provider: AIProvider,
    model: string,
    prompt: string,
    gatewayConfig: AIGatewayConfig,
    getBaseUrl: () => Promise<string | null>,
): Promise<AIGatewayResponseResult> {
    const providerConfig = gatewayConfig.providers[provider];
    if (!providerConfig?.api_key) {
        return {
            ok: false,
            latency_ms: 0,
            status_code: null,
            response_text: '',
            error_message: `${provider} API key not configured.`,
        };
    }

    const baseUrl = await getBaseUrl();
    if (!baseUrl) {
        return {
            ok: false,
            latency_ms: 0,
            status_code: null,
            response_text: '',
            error_message: 'AI gateway sidecar not found. Please run radar scan / health check.',
        };
    }

    try {
        const startTime = Date.now();
        const response = await fetch(`${baseUrl}/test/${provider}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${providerConfig.api_key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ model, prompt: prompt || 'ping' }),
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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
