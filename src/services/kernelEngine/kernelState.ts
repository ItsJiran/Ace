import type { KernelProcessEntry, KernelSharedEntry, KernelWindowEntry, KernelAISessionEntry } from './types';

/**
 * KernelStateSingleton
 *
 * Serves as the ultimate source of truth for the entire application state.
 * Holds 'kernel_memory' (physical RAM) and tracks listeners. 
 * Designed to be pure state without operative dependencies to avoid circular imports.
 */
class KernelStateSingleton {
    // Convert change_listeners from a single global Set to a Map grouping by memory_uid
    public readonly kernel_memory = new Map<string, any>();
    public readonly change_listeners = new Map<string, Set<() => void>>();

    constructor() {
        this._initSystemMaps();
    }

    private _initSystemMaps(): void {
        this.kernel_memory.set('system:process_system', new Map<string, KernelProcessEntry>());
        this.kernel_memory.set('system:shared_system',  new Map<string, KernelSharedEntry>());
        this.kernel_memory.set('system:window_system',  new Map<string, KernelWindowEntry>());
        this.kernel_memory.set('system:ai_gateway_sessions',  new Map<string, KernelAISessionEntry>());
    }

    resetKernelSpace(): void {
        // NOTE: Do NOT clear change_listeners map here.
        // React's useSyncExternalStore subscribes during the first render
        // (before bootACE runs in a useEffect). Clearing listeners severs
        // those subscriptions permanently, causing the UI to never react
        // to subsequent kernel memory updates.
        this.kernel_memory.clear();
        this._initSystemMaps();
    }

    get proc_sys(): Map<string, KernelProcessEntry> {
        return this.kernel_memory.get('system:process_system') as Map<string, KernelProcessEntry>;
    }

    get window_sys(): Map<string, KernelWindowEntry> {
        return this.kernel_memory.get('system:window_system') as Map<string, KernelWindowEntry>;
    }

    get shared_sys(): Map<string, KernelSharedEntry> {
        return this.kernel_memory.get('system:shared_system') as Map<string, KernelSharedEntry>;
    }

    get ai_gateway_sessions(): Map<string, KernelAISessionEntry> {
        return this.kernel_memory.get('system:ai_gateway_sessions') as Map<string, KernelAISessionEntry>;
    }
}

export const KernelState = new KernelStateSingleton();
