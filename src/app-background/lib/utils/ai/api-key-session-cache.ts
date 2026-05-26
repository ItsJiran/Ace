/**
 * In-process session cache for resolved API keys.
 *
 * Problem: deepagents' `task` tool creates sub-agent invocations that don't
 * inherit the parent LangGraph configurable (which carries `apiKey`). The
 * inject-api-key middleware runs for those sub-calls too, but finds no key in
 * `runtime.configurable` and no matching env var (when the user set the key
 * via the UI rather than via an environment variable).
 *
 * Solution: when a top-level stream run successfully resolves an apiKey (from
 * overrides or env), cache it here keyed by provider. Middleware reads this as
 * a last-resort fallback so sub-agent model calls always have credentials.
 *
 * Thread-safety: the cache is write-once per provider per session; concurrent
 * reads are safe in Node.js single-threaded event loop.
 */
const cache = new Map<string, string>();

export function cacheApiKey(provider: string, apiKey: string): void {
    if (provider && apiKey) {
        cache.set(provider, apiKey);
    }
}

export function getCachedApiKey(provider: string): string | null {
    return cache.get(provider) ?? null;
}
