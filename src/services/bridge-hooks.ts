/**
 * Bridge Hooks: Connect React hooks to window.ACE for external packages
 *
 * Purpose:
 * 1. Provide external packages with React hooks via window.ACE.hooks
 * 2. Auto-inject parent_process_uid from ProcessContext without prop-drilling
 * 3. Handle lazy-loading so React is available when packages load
 *
 * Usage in external package:
 * ```tsx
 * const { process_uid, parent_process_uid } = window.ACE.hooks.useProcessContext();
 * const subprocess = await KernelEngine.spawnSubprocess(process_uid, 'child_tool', {});
 * ```
 *
 * Setup: useProcessContextHook is registered in app.tsx via registerHooks()
 */

import { KernelEngine } from './kernel-engine';
import type { ProcessRecord } from '#/schemas/process';

interface BridgeHooksModule {
    /**
     * Get current process context (process_uid, parent_process_uid).
     * Extracted from nearest ProcessContextProvider in the component tree.
     *
     * Returns undefined if no ProcessContext available (fallback to window.ACE.process.getCurrentProcessUid()).
     */
    useProcessContext: () => {
        process_uid?: string;
        parent_process_uid?: string;
    };

    /**
     * Helper: Spawn subprocess with automatically injected parent_process_uid
     * from current context if not explicitly provided.
     */
    spawnSubprocessWithContext: (
        type: string,
        options?: {
            parent_process_uid?: string;
            metadata?: Record<string, any>;
            owner_engine?: string;
            payload?: Record<string, any>;
        },
    ) => ProcessRecord | null;

    /**
     * Helper: Create runtime memory with automatically injected owner_process_uid
     * from current context if not explicitly provided.
     */
    createMemoryWithContext: (
        payload: Record<string, any>,
        options?: {
            owner_process_uid?: string;
            memory_scope?: 'process' | 'session' | 'durable';
            retention_policy?: 'drop_on_done' | 'drop_on_cancel' | 'keep_on_done' | 'promote_to_context';
            classifications?: string[];
        },
    ) => string | null;
}

// Storage for the React hook function (set dynamically from app.tsx)
let useProcessContextHook: ((dependencies?: any[]) => any) | null = null;

/**
 * Register the useProcessContext hook so bridge can access it
 * Should be called from app.tsx after React mounts
 *
 * @param hook The useProcessContext hook function
 */
export function registerProcessContextHook(hook: () => any) {
    useProcessContextHook = hook;
    console.log('[BridgeHooks] useProcessContext hook registered');
}

/**
 * Create the bridge hooks module
 */
const bridgeHooksModule: BridgeHooksModule = {
    useProcessContext: () => {
        // If useProcessContextHook is registered, use it (inside React component)
        if (useProcessContextHook) {
            try {
                const context = useProcessContextHook();
                return {
                    process_uid: context?.process_uid,
                    parent_process_uid: context?.parent_process_uid,
                };
            } catch (err) {
                // Hook called outside component context
                // Fall through to fallback below
            }
        }

        // Fallback: Try to get from KernelEngine (outside React context)
        const fallback_uid = KernelEngine.getCurrentProcessContext();
        return {
            process_uid: fallback_uid,
            parent_process_uid: undefined,
        };
    },

    spawnSubprocessWithContext: (type, options) => {
        // Get parent from context if not provided
        const parent_uid = options?.parent_process_uid || KernelEngine.getCurrentProcessContext();

        if (!parent_uid) {
            console.warn(
                '[BridgeHooks] spawnSubprocessWithContext: No parent_process_uid available. ' +
                    'Make sure component is wrapped in ProcessContextProvider.',
            );
            return null;
        }

        try {
            return KernelEngine.spawnSubprocess(parent_uid, type, {
                metadata: options?.metadata,
                owner_engine: options?.owner_engine,
                payload: options?.payload,
            });
        } catch (err) {
            console.error('[BridgeHooks] spawnSubprocessWithContext error:', err);
            return null;
        }
    },

    createMemoryWithContext: (payload, options) => {
        // Get owner from context if not provided
        const owner_uid = options?.owner_process_uid || KernelEngine.getCurrentProcessContext();

        if (!owner_uid) {
            console.warn(
                '[BridgeHooks] createMemoryWithContext: No owner_process_uid available. ' +
                    'Make sure component is wrapped in ProcessContextProvider.',
            );
            return null;
        }

        try {
            return (
                KernelEngine.createRuntimeMemory({
                    owner_process_uid: owner_uid,
                    payload,
                    memory_scope: options?.memory_scope,
                    retention_policy: options?.retention_policy,
                    classifications: options?.classifications,
                }) || null
            );
        } catch (err) {
            console.error('[BridgeHooks] createMemoryWithContext error:', err);
            return null;
        }
    },
};

/**
 * Initialize bridge hooks after app mounts
 * Should be called once in app.tsx useEffect with dependency []
 */
export function initializeBridgeHooks() {
    // Register in window.ACE.hooks so packages can access
    if (typeof window !== 'undefined' && (window as any).ACE) {
        (window as any).ACE.hooks = bridgeHooksModule;
    }

    console.log('[BridgeHooks] Initialized and registered to window.ACE.hooks');
}

export type { BridgeHooksModule };

