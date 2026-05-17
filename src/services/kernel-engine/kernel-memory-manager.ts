import type { RAMInteractivity } from '#/schemas/storage';
import type { ProcessRuntimeMemoryMeta, RuntimeMemoryRetentionPolicy, RuntimeMemoryScope } from '#/schemas/process';
import { KernelState } from './kernel-state';
import { KernelTelemetry } from './kernel-telemetry';
import { KernelContextManager } from './kernel-context-manager';
import { PerformanceObserver } from '../performance-observer';

// Attach observer flush hook immediately upon evaluating the import
if (typeof window !== 'undefined' && import.meta.env.VITE_PERF_LOG === 'true') {
    PerformanceObserver.flushCallback = (logs) => {
        KernelMemoryManager.writeMemory('system:perf_observer:ram', logs);
    };
}

const generateUid = () => 'mem-' + Math.random().toString(36).substring(2, 11);
const textEncoder = new TextEncoder();

/**
 * Utility to perform deep/shallow equals, avoiding unnecessary storage thrashing.
 */
function isShallowEqual(a: any, b: any): boolean {
    if (Object.is(a, b)) return true;
    if (a instanceof Map && b instanceof Map) {
        if (a.size !== b.size) return false;
        for (const [k, v] of a.entries()) {
            if (!b.has(k) || !Object.is(v, b.get(k))) return false;
        }
        return true;
    }
    if (a instanceof Set && b instanceof Set) {
        if (a.size !== b.size) return false;
        for (const v of a.values()) {
            if (!b.has(v)) return false;
        }
        return true;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((val, i) => Object.is(val, b[i]));
    }
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        if (aKeys.length !== bKeys.length) return false;
        return aKeys.every(key => Object.prototype.hasOwnProperty.call(b, key) && Object.is(a[key], b[key]));
    }
    return false;
}

/**
 * KernelMemoryManager
 * 
 * Sub-service of the KernelEngine responsible for allocating, updating,
 * and deleting memory blocks within the 'physical' RAM tracking system.
 * 
 * Concepts:
 * - kernel_memory: The central Map<string, any> holding live state across window and hooks.
 * - process_uid: Every piece of memory must be attributed to a process ID.
 *   This ensures memory can be traced, monitored, and garbage-collected when the parent process dies.
 * - Reactive Listeners: Propagates physical RAM mutations immediately out to the UI React hooks.
 */
export class KernelMemoryManager {
    // Batch mode: suppress per-write notifications and fire them all once at the end.
    private static isBatching = false;
    private static batchedNotifications = new Set<string>();

    private static cloneForStorage(payload: any, skipClone: boolean = false): any {
        return (skipClone || !payload || typeof payload !== 'object')
            ? payload
            : payload instanceof Map
                ? new Map(payload)
                : payload instanceof Set
                    ? new Set(payload)
                    : Array.isArray(payload)
                        ? [...payload]
                        : { ...payload };
    }

    private static notifyMemoryChanged(memory_uid: string): void {
        if (this.isBatching) {
            this.batchedNotifications.add(memory_uid);
            return;
        }
        const listeners = KernelState.change_listeners.get(memory_uid);
        if (listeners) {
            for (const listener of Array.from(listeners)) {
                try { listener(); } catch (error) { console.error('[KernelMemoryManager] Listener error:', error); }
            }
        }
    }

    /**
     * Execute `fn` in batch mode: all RAM writes inside the callback defer their
     * listener notifications until `fn` returns, then each unique key fires once.
     * Prevents sequential writes from cascading into separate React render passes.
     */
    static batch(fn: () => void): void {
        if (this.isBatching) { fn(); return; } // Already batching — just run
        this.isBatching = true;
        try {
            fn();
        } finally {
            this.isBatching = false;
            const pending = Array.from(this.batchedNotifications);
            this.batchedNotifications.clear();
            for (const uid of pending) {
                this.notifyMemoryChanged(uid);
            }
        }
    }

    /**
     * Resolves the requesting process's UID.
     * Returns undefined when no uid is provided and async context tracking is not active.
     * Async context tracking is not implemented yet — callers that need ownership tracking
     * must pass process_uid explicitly.
     */
    private static _getProcessUid(provided?: string): string | undefined {
        return provided || KernelContextManager.getCurrentProcessContext() || undefined;
    }

    /**
     * Internal mutation handler that establishes equality checks and bounds the memory to its owner process.
     */
    private static writeMemoryInternal(memory_uid: string, payload: any, process_uid?: string, skipClone: boolean = false): void {
        PerformanceObserver.trackRamOp('WRITE', memory_uid, process_uid, payload);
        const existingPayload = KernelState.kernel_memory.get(memory_uid);

        if (isShallowEqual(existingPayload, payload)) return;

        // PERF: Defensive deep-cloning causes massive GC pressure for high-frequency updates.
        // We now allow callers (like window drag logic or perf monitors) to skip it.
        const immutablePayload = (skipClone || !payload || typeof payload !== 'object')
            ? payload
            : payload instanceof Map
                ? new Map(payload)
                : payload instanceof Set
                    ? new Set(payload)
                    : Array.isArray(payload)
                        ? [...payload]
                        : { ...payload };

        KernelState.kernel_memory.set(memory_uid, immutablePayload);

        if (process_uid) {
            const proc = KernelState.proc_sys.get(process_uid);
            if (proc) {
                proc.memories_ids.add(memory_uid);
                console.log(`[mem_bind] memory=${memory_uid} process=${process_uid}`);
            } else {
                console.warn(`[KernelMemoryManager] Attempted to bind memory ${memory_uid} to missing process ${process_uid}`);
            }
        }

        this.notifyMemoryChanged(memory_uid);
    }

    // ─── Public API ────────────────────────────────────────────────────────

    /**
     * Create generic memory.
     * @param payload Struct or primitive to store.
     * @param process_uid Required owning process UID. Every piece of kernel memory must be bound to a
     *   process so it can be traced and garbage-collected when that process (or its ancestors) terminates.
     * @param memory_uid Optional designated ID. If omitted, a new distinct ID is generated.
     */
    static createMemory(payload: any, process_uid: string, memory_uid?: string): string {
        if (memory_uid && KernelState.kernel_memory.has(memory_uid)) {
            throw new Error(`[KernelMemoryManager] createMemory: uid already exists — use writeMemory or updateMemory to mutate existing entries: ${memory_uid}`);
        }
        const uid = memory_uid || generateUid();
        this.writeMemoryInternal(uid, payload, this._getProcessUid(process_uid));
        return uid;
    }

    /**
     * Create memory only if the uid does not already exist.
     * If a slot with the same uid is already present, silently returns that uid without touching the existing payload.
     * Requires `memory_uid` — callers that want auto-generated ids should use `createMemory` instead.
     */
    static createMemoryIfNotExist(memory_uid: string, payload: any, process_uid: string): string {
        if (KernelState.kernel_memory.has(memory_uid)) return memory_uid;
        this.writeMemoryInternal(memory_uid, payload, this._getProcessUid(process_uid));
        return memory_uid;
    }

    /**
     * Create memory if the uid does not exist, or return (and optionally merge) the existing entry.
     * - If the uid is new: allocates with `payload` and returns `{ uid, created: true }`.
     * - If the uid already exists: merges `payload` into the existing value (shallow merge),
     *   notifies listeners, and returns `{ uid, created: false }`.
     *
     * Use this when you want "ensure this memory exists with at least these values" semantics.
     */
    static createOrUpdateMemory(memory_uid: string, payload: any, process_uid: string): { uid: string; created: boolean } {
        if (!KernelState.kernel_memory.has(memory_uid)) {
            this.writeMemoryInternal(memory_uid, payload, this._getProcessUid(process_uid));
            return { uid: memory_uid, created: true };
        }
        const existing = KernelState.kernel_memory.get(memory_uid);
        const merged = (typeof existing === 'object' && existing !== null && typeof payload === 'object' && payload !== null && !Array.isArray(existing) && !Array.isArray(payload))
            ? { ...existing, ...payload }
            : payload;

        if (!isShallowEqual(existing, merged)) {
            this.writeMemoryInternal(memory_uid, merged, process_uid);
        }
        return { uid: memory_uid, created: false };
    }

    static setMemory(memory_uid: string, payload: any, process_uid?: string): boolean {
        if (!memory_uid) return false;
        if (KernelState.kernel_memory.has(memory_uid)) {
            throw new Error(`[KernelMemoryManager] setMemory requires unique uid: ${memory_uid}`);
        }
        this.writeMemoryInternal(memory_uid, payload, process_uid);
        return true;
    }

    static writeMemory(memory_uid: string, payload: any, process_uid?: string): boolean {
        if (!memory_uid) return false;
        // Optimization: Assume callers creating explicit `{}` payloads intend replacement.
        // If they pass an object, we trust it's a fresh reference (skipClone: true)
        this.writeMemoryInternal(memory_uid, payload, process_uid, true);
        return true;
    }

    static mutateMapMemory<K, V>(
        memory_uid: string,
        mutator: (draft: Map<K, V>) => void,
        process_uid?: string,
    ): boolean {
        if (!memory_uid) return false;

        const existing = KernelState.kernel_memory.get(memory_uid);
        if (existing !== undefined && !(existing instanceof Map)) {
            throw new Error(`[KernelMemoryManager] mutateMapMemory requires Map payload at uid: ${memory_uid}`);
        }

        const draft = existing instanceof Map ? new Map(existing) : new Map<K, V>();
        mutator(draft);
        this.writeMemoryInternal(memory_uid, draft, process_uid, true);
        return true;
    }

    static readMemory(memory_uid: string): any {
        PerformanceObserver.trackRamOp('READ', memory_uid, 'kernel');
        return memory_uid ? KernelState.kernel_memory.get(memory_uid) : undefined;
    }

    /** Returns all current memory UIDs in the kernel store. Useful for diagnostic/inspector tooling. */
    static getAllMemoryKeys(): string[] {
        return Array.from(KernelState.kernel_memory.keys());
    }

    static updateMemory(memory_uid: string, payload: any, process_uid?: string): boolean {
        if (!memory_uid || !KernelState.kernel_memory.has(memory_uid)) return false;

        const existing = KernelState.kernel_memory.get(memory_uid);
        const merged = (typeof existing === 'object' && existing !== null && typeof payload === 'object' && payload !== null && !Array.isArray(existing) && !Array.isArray(payload))
            ? { ...existing, ...payload }
            : payload;

        if (!isShallowEqual(existing, merged)) {
            // PERF: merged is already an independent object reference. Skip nested clones.
            this.writeMemoryInternal(memory_uid, merged, process_uid, true);
        }
        return true;
    }

    static deleteMemory(memory_uid: string): boolean {
        PerformanceObserver.trackRamOp('DELETE', memory_uid, 'kernel');
        if (!memory_uid || !KernelState.kernel_memory.has(memory_uid)) return false;
        KernelState.kernel_memory.delete(memory_uid);
        this.notifyMemoryChanged(memory_uid);
        return true;
    }

    static subscribe(memory_uid: string, callback: (data: any) => void): () => void {
        PerformanceObserver.trackRamOp('SUBSCRIBE', memory_uid, 'kernel');
        if (!KernelState.change_listeners.has(memory_uid)) {
            KernelState.change_listeners.set(memory_uid, new Set());
        }
        const listener = () => callback(this.readMemory(memory_uid));
        KernelState.change_listeners.get(memory_uid)!.add(listener);

        return () => {
            PerformanceObserver.trackRamOp('UNSUBSCRIBE', memory_uid, 'kernel');
            const listeners = KernelState.change_listeners.get(memory_uid);
            if (listeners) {
                listeners.delete(listener);
                if (listeners.size === 0) {
                    KernelState.change_listeners.delete(memory_uid);
                }
            }
        };
    }

    static commitMemory(request: RAMInteractivity): any {
        const { action, payload, memory_uid, process_uid } = request as any;
        switch (action) {
            case 'create_memory': return this.createMemory(payload, process_uid, memory_uid);
            case 'set_memory': return this.setMemory(memory_uid, payload, process_uid);
            case 'write_memory': return this.writeMemory(memory_uid, payload, process_uid);
            case 'read_memory': return this.readMemory(memory_uid);
            case 'update_memory': return this.updateMemory(memory_uid, payload, process_uid);
            case 'delete_memory': return this.deleteMemory(memory_uid);
        }
    }

    /**
     * Register a system-level memory slot (engine singletons, boot-time state).
     * Idempotent — silently skips if the uid is already registered.
     * Unlike createMemory / setMemory, this does NOT require a process_uid because
     * system memories are owned by the kernel, not by any user-space process.
     */
    static registerSystemMemory(memory_uid: string, payload: any): void {
        if (KernelState.kernel_memory.has(memory_uid)) return;
        PerformanceObserver.trackRamOp('WRITE', memory_uid, 'kernel', payload);
        const immutablePayload = this.cloneForStorage(payload);
        KernelState.kernel_memory.set(memory_uid, immutablePayload);
        this.notifyMemoryChanged(memory_uid);
        KernelTelemetry.logDebug('registerSystemMemory', { memory_uid });
    }

    // ─── Runtime Specific Allocation ──────────────────────────────────────

    static createRuntimeMemory(input: {
        owner_process_uid: string;
        memory_uid?: string;
        payload: Record<string, any>;
        owner_session_id?: string;
        memory_scope?: RuntimeMemoryScope;
        retention_policy?: RuntimeMemoryRetentionPolicy;
        classifications?: string[];
    }): string | null {
        const uid = this.createMemory(input.payload, input.owner_process_uid, input.memory_uid);
        KernelTelemetry.logDebug('createRuntimeMemory', { memory_uid: uid, owner_process_uid: input.owner_process_uid });
        return uid;
    }

    static updateRuntimeMemory(input: {
        owner_process_uid: string;
        memory_uid: string;
        payload: Record<string, any>;
    }): boolean {
        const updated = this.updateMemory(input.memory_uid, input.payload, input.owner_process_uid);
        if (updated) {
            KernelTelemetry.logDebug('updateRuntimeMemory', { memory_uid: input.memory_uid, owner_process_uid: input.owner_process_uid });
        }
        return updated;
    }

    static getRuntimeMemoryMeta(_memory_uid: string): ProcessRuntimeMemoryMeta | undefined {
        return undefined; // Stubbed for now
    }

    static enforceRuntimeMemoryOwnership(_input: { process_uid: string; memory_uid: string }): { allowed: boolean; reason?: string } {
        return { allowed: true };
    }

    static getRAMStats() {
        // Build reverse map: memory_uid → process_uid by iterating all processes
        const memoryToProcessMap = new Map<string, string>();
        for (const [processUid, processEntry] of KernelState.proc_sys.entries()) {
            for (const memoryUid of processEntry.memories_ids) {
                memoryToProcessMap.set(memoryUid, processUid);
            }
        }

        const entries = Array.from(KernelState.kernel_memory.entries()).map(([k, v]) => ({
            memory_uid: k,
            process_uid: memoryToProcessMap.get(k) || '(orphan)',
            approx_bytes: this.estimatePayloadBytes(v),
            type:
                v instanceof Map ? 'map'
                    : v instanceof Set ? 'set'
                        : Array.isArray(v) ? 'array'
                            : typeof v,
            child_count:
                v instanceof Map || v instanceof Set ? v.size
                    : Array.isArray(v) ? v.length
                        : (v && typeof v === 'object') ? Object.keys(v as Record<string, unknown>).length
                            : 0
        })).sort((a, b) => b.approx_bytes - a.approx_bytes);

        const approxTotalBytes = entries.reduce((acc, curr) => acc + curr.approx_bytes, 0);
        let lCount = 0;
        const listenersByKey: { key: string, listeners: number }[] = [];
        for (const [key, listeners] of KernelState.change_listeners.entries()) {
            lCount += listeners.size;
            if (listeners.size > 0) {
                listenersByKey.push({ key, listeners: listeners.size });
            }
        }

        return {
            memory_entries: entries.length,
            change_listener_total: lCount,
            socket_keys: 0, // Legacy field
            socket_listener_total: lCount, // Legacy field
            approx_total_bytes: approxTotalBytes,
            approx_total_kb: approxTotalBytes / 1024,
            approx_total_mb: approxTotalBytes / (1024 * 1024),
            largest_memories: entries,
            listeners_by_key: listenersByKey,
            sampled_at: Date.now(),
        };
    }

    private static estimatePayloadBytes(payload: unknown): number {
        if (payload == null) return 0;
        if (typeof payload === 'string') return textEncoder.encode(payload).length;
        if (typeof payload === 'number' || typeof payload === 'boolean' || typeof payload === 'bigint') {
            return textEncoder.encode(String(payload)).length;
        }
        if (payload instanceof Map) {
            try {
                return textEncoder.encode(JSON.stringify(Array.from(payload.entries()))).length;
            } catch {
                return 0;
            }
        }
        if (payload instanceof Set) {
            try {
                return textEncoder.encode(JSON.stringify(Array.from(payload.values()))).length;
            } catch {
                return 0;
            }
        }
        try {
            const serialized = JSON.stringify(payload);
            return serialized ? textEncoder.encode(serialized).length : 0;
        } catch {
            return 0;
        }
    }
}
