import { RegistryEngine } from './registryEngine';
import { StorageEngine } from './storageEngine';
import type { CancellationToken } from './cancellationToken';
import { createCancellationToken } from './cancellationToken';
import type {
    ProcessKind,
    ProcessLifecycleState,
    ProcessRecord,
    ProcessRuntimeMemoryMeta,
    ProcessStatus,
    RuntimeMemoryRetentionPolicy,
    RuntimeMemoryScope,
    RuntimeMemoryState,
} from '#/schemas/process';
import { PROCESS_STATUS } from '#/schemas/process';

type ProcessTerminationHandler = (input: {
    record: ProcessRecord;
    root_process_uid: string;
    reason: string;
    cascade: boolean;
}) => void;

class ProcessEngineSingleton {
    private readonly processRegistryTag = 'system:process_registry';
    private readonly processGroupTag = 'system:process_group';
    private readonly processTreeTag = 'system:process_tree';

    private readonly runtimeMemoryMeta = new Map<string, ProcessRuntimeMemoryMeta>();
    private readonly processOwnedMemory = new Map<string, Set<string>>();
    private readonly cancellationTokens = new Map<string, CancellationToken>();

    private readonly terminalStateSet = new Set<ProcessLifecycleState>([
        PROCESS_STATUS.DONE,
        PROCESS_STATUS.FAILED,
        PROCESS_STATUS.CANCELLED,
        PROCESS_STATUS.TERMINATED,
    ]);

    private readonly processContextStack: string[] = [];
    private readonly terminationHandlersByOwnerEngine = new Map<string, Set<ProcessTerminationHandler>>();

    private getAncestorProcessUids(process_uid: string): string[] {
        const ancestors: string[] = [];
        const seen = new Set<string>([process_uid]);

        let cursor = this.readProcess(process_uid)?.parent_process_uid;
        while (cursor) {
            if (seen.has(cursor)) break;
            seen.add(cursor);
            ancestors.push(cursor);
            cursor = this.readProcess(cursor)?.parent_process_uid;
        }

        return ancestors;
    }

    private linkRuntimeMemoryToProcess(process_uid: string, memory_uid: string) {
        const currentOwned = this.processOwnedMemory.get(process_uid) ?? new Set<string>();
        currentOwned.add(memory_uid);
        this.processOwnedMemory.set(process_uid, currentOwned);

        const processRecord = this.readProcess(process_uid);
        if (!processRecord) return;

        const currentUids = Array.isArray(processRecord.runtime_memory_uids) ? processRecord.runtime_memory_uids : [];
        if (currentUids.includes(memory_uid)) return;

        this.writeProcess(process_uid, {
            runtime_memory_uids: [...currentUids, memory_uid],
            updated_at: Date.now(),
        });
    }

    private unlinkRuntimeMemoryFromProcess(process_uid: string, memory_uid: string) {
        const owned = this.processOwnedMemory.get(process_uid);
        if (owned?.has(memory_uid)) {
            owned.delete(memory_uid);
            if (owned.size === 0) {
                this.processOwnedMemory.delete(process_uid);
            }
        }

        const processRecord = this.readProcess(process_uid);
        if (!processRecord) return;
        const currentUids = Array.isArray(processRecord.runtime_memory_uids) ? processRecord.runtime_memory_uids : [];
        if (!currentUids.includes(memory_uid)) return;

        this.writeProcess(process_uid, {
            runtime_memory_uids: currentUids.filter((uid) => uid !== memory_uid),
            updated_at: Date.now(),
        });
    }

    private unlinkRuntimeMemoryEverywhere(memory_uid: string) {
        [...this.processOwnedMemory.keys()].forEach((process_uid) => {
            this.unlinkRuntimeMemoryFromProcess(process_uid, memory_uid);
        });
    }

    /**
     * [Phase D] Emit deprecation warning for direct ProcessEngine calls.
     * Encourages gradual migration to KernelEngine facade.
     * Used during Phase C->D transition; removed in future major version.
     */
    private warnDeprecation(method: string, alternative: string) {
        const stack = new Error().stack || '';
        const caller = stack.split('\n')[3]?.trim() || 'unknown';

        // Ignore internal call chains so warnings only target external direct usage.
        if (caller.includes('kernelEngine.ts') || caller.includes('processEngine.ts')) {
            return;
        }

        console.warn(
            `[ProcessEngine:DEPRECATED] Direct call to ProcessEngine.${method}() detected.` +
                `\n  Use KernelEngine.${alternative}() instead for phase D compliance.` +
                `\n  Caller: ${caller}` +
                '\n  This will be removed in a future version.',
        );
    }

    /**
     * Retrieve a specific process definition from the registry.
     * Wraps RegistryEngine.getDomainEntry with 'processes' domain preset.
     */
    getRegistry({ packageRef, slug }: { packageRef: string; slug: string }) {
        return RegistryEngine.getDomainEntry(packageRef, 'processes', slug);
    }

    private canonicalStateFromStatus(status: ProcessStatus): ProcessLifecycleState {
        if (status === PROCESS_STATUS.CREATED || status === PROCESS_STATUS.RUNNING || status === PROCESS_STATUS.WAITING) return status;
        if (status === PROCESS_STATUS.DONE || status === PROCESS_STATUS.FAILED || status === PROCESS_STATUS.CANCELLED || status === PROCESS_STATUS.TERMINATED) return status;
        return PROCESS_STATUS.CREATED;
    }

    private statusFromLifecycleState(state: ProcessLifecycleState): ProcessStatus {
        return state;
    }

    private isTerminalState(state: ProcessLifecycleState): boolean {
        return this.terminalStateSet.has(state);
    }

    private canTransition(from: ProcessLifecycleState, to: ProcessLifecycleState): boolean {
        if (from === to) return true;
        if (this.isTerminalState(from)) return false;
        if (from === PROCESS_STATUS.CREATED) return to === PROCESS_STATUS.RUNNING || to === PROCESS_STATUS.WAITING || this.isTerminalState(to);
        if (from === PROCESS_STATUS.RUNNING) return to === PROCESS_STATUS.WAITING || this.isTerminalState(to);
        if (from === PROCESS_STATUS.WAITING) return to === PROCESS_STATUS.RUNNING || this.isTerminalState(to);
        return false;
    }

    private readProcess(process_uid: string): ProcessRecord | undefined {
        return StorageEngine.readMemory(process_uid) as ProcessRecord | undefined;
    }

    private writeProcess(process_uid: string, patch: Partial<ProcessRecord>): boolean {
        return Boolean(
            StorageEngine.dispatchRAMAction({
                action: 'update_memory',
                process_uid: 'system',
                memory_uid: process_uid,
                payload: patch,
                classifications: [this.processRegistryTag],
            }),
        );
    }

    private addChildLink(parent_process_uid: string, child_process_uid: string) {
        const parent = this.readProcess(parent_process_uid);
        if (!parent) return;

        const nextChildren = Array.isArray(parent.child_process_uids)
            ? [...new Set([...parent.child_process_uids, child_process_uid])]
            : [child_process_uid];

        this.writeProcess(parent_process_uid, {
            child_process_uids: nextChildren,
            updated_at: Date.now(),
        });

        StorageEngine.dispatchRAMAction({
            action: 'update_memory',
            process_uid: 'system',
            memory_uid: `group:${parent_process_uid}`,
            payload: { [child_process_uid]: true },
            classifications: [this.processGroupTag, this.processTreeTag],
        });
    }

    private collectDescendants(process_uid: string): string[] {
        const seen = new Set<string>();
        const stack = [process_uid];
        while (stack.length > 0) {
            const current = stack.pop() as string;
            if (seen.has(current)) continue;
            seen.add(current);

            const record = this.readProcess(current);
            const children = Array.isArray(record?.child_process_uids) ? record.child_process_uids : [];
            children.forEach((childUid) => {
                if (!seen.has(childUid)) stack.push(childUid);
            });
        }

        // Descendants only, not including root.
        seen.delete(process_uid);
        return [...seen];
    }

    private runTerminationHandlers(input: {
        record: ProcessRecord;
        root_process_uid: string;
        reason: string;
        cascade: boolean;
    }) {
        const ownerEngine = input.record.owner_engine;
        if (!ownerEngine) return;

        const handlers = this.terminationHandlersByOwnerEngine.get(ownerEngine);
        if (!handlers || handlers.size === 0) return;

        handlers.forEach((handler) => {
            try {
                handler(input);
            } catch (error) {
                console.warn(
                    `[ProcessEngine] Termination handler failed for owner_engine="${ownerEngine}" process_uid="${input.record.process_uid}":`,
                    error,
                );
            }
        });
    }

    private cleanupRuntimeMemoryForProcess(process_uid: string, state: ProcessLifecycleState) {
        const owned = this.processOwnedMemory.get(process_uid);
        if (!owned || owned.size === 0) return;

        const now = Date.now();
        for (const memory_uid of owned) {
            const meta = this.runtimeMemoryMeta.get(memory_uid);
            if (!meta) continue;

            let nextState: RuntimeMemoryState = 'active';
            let shouldDelete = false;

            if (state === 'cancelled' || state === 'terminated') {
                shouldDelete = meta.retention_policy !== 'keep_on_done' && meta.retention_policy !== 'promote_to_context';
                nextState = shouldDelete ? 'deleted' : 'frozen';
            } else if (state === 'failed') {
                shouldDelete = meta.retention_policy === 'drop_on_done' || meta.retention_policy === 'drop_on_cancel';
                nextState = shouldDelete ? 'deleted' : 'frozen';
            } else if (state === 'done') {
                shouldDelete = meta.retention_policy === 'drop_on_done';
                nextState = shouldDelete ? 'deleted' : (meta.retention_policy === 'promote_to_context' ? 'archived' : 'frozen');
            }

            if (shouldDelete) {
                StorageEngine.dispatchRAMAction({
                    action: 'delete_memory',
                    process_uid,
                    memory_uid,
                });
                this.runtimeMemoryMeta.delete(memory_uid);
                this.unlinkRuntimeMemoryEverywhere(memory_uid);
                continue;
            }

            this.runtimeMemoryMeta.set(memory_uid, {
                ...meta,
                state: nextState,
                updated_at: now,
            });
        }
    }

    private transitionState(
        process_uid: string,
        nextState: ProcessLifecycleState,
        options?: { metadata_patch?: Record<string, any>; reason?: string; force?: boolean },
    ): boolean {
        const existing = this.readProcess(process_uid);
        if (!existing) return false;

        const currentState = existing.lifecycle_state ?? this.canonicalStateFromStatus(existing.status);
        if (!options?.force && !this.canTransition(currentState, nextState)) {
            return false;
        }

        const now = Date.now();
        const isTerminal = this.isTerminalState(nextState);
        const payload: Partial<ProcessRecord> = {
            lifecycle_state: nextState,
            status: this.statusFromLifecycleState(nextState),
            updated_at: now,
            metadata: options?.metadata_patch
                ? { ...(existing.metadata ?? {}), ...options.metadata_patch }
                : existing.metadata,
            termination_reason: options?.reason ?? existing.termination_reason,
        };

        if (isTerminal) {
            payload.ended_at = now;
        }

        const ok = this.writeProcess(process_uid, payload);
        if (!ok) return false;

        if (isTerminal) {
            this.cleanupRuntimeMemoryForProcess(process_uid, nextState);
        }

        return true;
    }

    registerProcess(
        type: string,
        metadata?: Record<string, any>,
        preallocated_memory: Record<string, any> = {},
        waiting_for_processes: string[] = [],
        group_pid?: string,
        origin_window_uid?: string,
        origin_widget_uid?: string,
        options?: {
            parent_process_uid?: string;
            process_kind?: ProcessKind;
            owner_engine?: string;
            payload?: Record<string, any>;
        }
    ): ProcessRecord {
        // [Phase D] Deprecation: Use KernelEngine.spawnProcess() for new code
        this.warnDeprecation(
            'registerProcess',
            options?.parent_process_uid ? 'spawnSubprocess' : 'spawnProcess',
        );

        const process_uid = 'proc-' + crypto.randomUUID();
        const now = Date.now();

        const record: ProcessRecord = {
            process_uid,
            group_pid,
            parent_process_uid: options?.parent_process_uid,
            child_process_uids: [],
            type,
            status: 'created',
            lifecycle_state: 'created',
            process_kind: options?.process_kind,
            owner_engine: options?.owner_engine,
            started_at: now,
            updated_at: now,
            origin_window_uid,
            origin_widget_uid,
            metadata,
            waiting_for_processes,
            preallocated_memory,
            payload: options?.payload ?? {},
            process_generation: 1,
            runtime_memory_uids: [],
        };

        StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            process_uid: 'system',
            memory_uid: process_uid,
            payload: record,
            classifications: [this.processRegistryTag, this.processTreeTag],
        });

        if (group_pid) {
            StorageEngine.dispatchRAMAction({
                action: 'update_memory',
                process_uid: 'system',
                memory_uid: `group:${group_pid}`,
                payload: { [process_uid]: true },
                classifications: [this.processGroupTag],
            });
        }

        if (options?.parent_process_uid) {
            this.addChildLink(options.parent_process_uid, process_uid);
        }

        return record;
    }

    spawnSubprocess(input: {
        parent_process_uid: string;
        type: string;
        metadata?: Record<string, any>;
        preallocated_memory?: Record<string, any>;
        waiting_for_processes?: string[];
        origin_window_uid?: string;
        origin_widget_uid?: string;
        process_kind?: ProcessKind;
        owner_engine?: string;
        payload?: Record<string, any>;
    }): ProcessRecord {
        // [Phase D] Deprecation: Use KernelEngine.spawnSubprocess() for new code
        this.warnDeprecation('spawnSubprocess', 'spawnSubprocess');

        return this.registerProcess(
            input.type,
            input.metadata,
            input.preallocated_memory ?? {},
            input.waiting_for_processes ?? [],
            input.parent_process_uid,
            input.origin_window_uid,
            input.origin_widget_uid,
            {
                parent_process_uid: input.parent_process_uid,
                process_kind: input.process_kind,
                owner_engine: input.owner_engine,
                payload: input.payload,
            },
        );
    }

    /**
     * Updates the status of an active process.
     */
    updateStatus(process_uid: string, status: ProcessStatus, metadata_patch?: Record<string, any>) {
        // [Phase D] Deprecation: Use KernelEngine.updateProcessStatus() for new code
        this.warnDeprecation('updateStatus', 'updateProcessStatus');

        return this.transitionState(process_uid, this.canonicalStateFromStatus(status), {
            metadata_patch,
        });
    }

    updateLifecycleState(
        process_uid: string,
        lifecycle_state: ProcessLifecycleState,
        metadata_patch?: Record<string, any>,
    ) {
        return this.transitionState(process_uid, lifecycle_state, {
            metadata_patch,
        });
    }

    updatePayload(
        process_uid: string,
        updater:
            | Record<string, any>
            | ((currentPayload: Record<string, any>) => Record<string, any>),
    ): boolean {
        // [Phase D] Deprecation: Use KernelEngine.updateProcessPayload() for new code
        this.warnDeprecation('updatePayload', 'updateProcessPayload');

        const existing = this.readProcess(process_uid);
        if (!existing) return false;

        const currentState = existing.lifecycle_state ?? this.canonicalStateFromStatus(existing.status);
        if (this.isTerminalState(currentState)) {
            return false;
        }

        const currentPayload = (existing.payload && typeof existing.payload === 'object')
            ? (existing.payload as Record<string, any>)
            : {};
        const nextPayload = typeof updater === 'function' ? updater(currentPayload) : { ...currentPayload, ...updater };

        return this.writeProcess(process_uid, {
            payload: nextPayload,
            updated_at: Date.now(),
        });
    }

    getProcess(process_uid: string): ProcessRecord | undefined {
        return this.readProcess(process_uid);
    }

    isProcessActive(process_uid: string): boolean {
        const existing = this.readProcess(process_uid);
        if (!existing) return false;
        const state = existing.lifecycle_state ?? this.canonicalStateFromStatus(existing.status);
        return !this.isTerminalState(state);
    }

    subscribe(process_uid: string, callback: (record: ProcessRecord | null) => void) {
        return StorageEngine.subscribe(process_uid, (data: unknown) => {
            callback((data as ProcessRecord | null) ?? null);
        });
    }

    registerTerminationHandler(owner_engine: string, handler: ProcessTerminationHandler): () => void {
        const current = this.terminationHandlersByOwnerEngine.get(owner_engine) ?? new Set<ProcessTerminationHandler>();
        current.add(handler);
        this.terminationHandlersByOwnerEngine.set(owner_engine, current);

        return () => {
            const latest = this.terminationHandlersByOwnerEngine.get(owner_engine);
            if (!latest) return;
            latest.delete(handler);
            if (latest.size === 0) {
                this.terminationHandlersByOwnerEngine.delete(owner_engine);
            }
        };
    }

    /**
     * Kills a process. It keeps it in RAM for UI history and marks it as terminated.
     */
    killProcess(process_uid: string) {
        return this.terminateProcess(process_uid, {
            mode: 'force',
            reason: 'kill_process_called',
            cascade: true,
        });
    }

    requestCancel(process_uid: string, reason = 'cancel_requested') {
        const existing = this.readProcess(process_uid);
        if (!existing) return false;

        const currentState = existing.lifecycle_state ?? this.canonicalStateFromStatus(existing.status);
        if (this.isTerminalState(currentState)) return false;

        return this.writeProcess(process_uid, {
            cancellation_requested_at: Date.now(),
            termination_reason: reason,
            updated_at: Date.now(),
        });
    }

    terminateProcess(
        process_uid: string,
        options?: {
            mode?: 'graceful' | 'force';
            reason?: string;
            cascade?: boolean;
            timeout_ms?: number;
        },
    ) {
        const mode = options?.mode ?? 'graceful';
        const cascade = options?.cascade ?? true;
        const reason = options?.reason ?? (mode === 'force' ? 'force_terminated' : 'graceful_terminated');

        if (mode === 'graceful') {
            this.requestCancel(process_uid, reason);

            // Cancel the process's cancellation token to signal graceful shutdown
            const token = this.cancellationTokens.get(process_uid);
            if (token && !token.isCancelled) {
                token.cancel(`graceful_shutdown:${reason}`);
            }

            const timeout = options?.timeout_ms ?? 350;
            setTimeout(() => {
                if (!this.isProcessActive(process_uid)) return;
                this.terminateProcess(process_uid, {
                    mode: 'force',
                    reason: `${reason}:grace_timeout`,
                    cascade,
                });
            }, timeout);
            return true;
        }

        const tree = cascade ? [process_uid, ...this.collectDescendants(process_uid)] : [process_uid];
        // Descendants first, then parent.
        tree
            .slice()
            .reverse()
            .forEach((uid) => {
                const record = this.readProcess(uid);
                if (!record) return;
                const currentState = record.lifecycle_state ?? this.canonicalStateFromStatus(record.status);
                if (this.isTerminalState(currentState)) return;

                // Cancel the process's cancellation token during force termination
                const token = this.cancellationTokens.get(uid);
                if (token && !token.isCancelled) {
                    token.cancel(`force_termination:${reason}`);
                }

                this.runTerminationHandlers({
                    record,
                    root_process_uid: process_uid,
                    reason,
                    cascade,
                });

                this.transitionState(uid, 'terminated', {
                    reason,
                    force: true,
                    metadata_patch: {
                        terminated_by: process_uid,
                    },
                });
            });

        return true;
    }

    terminateSubtree(process_uid: string, reason = 'terminate_subtree') {
        return this.terminateProcess(process_uid, {
            mode: 'force',
            reason,
            cascade: true,
        });
    }

    /**
     * Get or create a cancellation token for a process.
     * Token is automatically cancelled when process terminates.
     *
     * @param process_uid Process UID
     * @returns Cancellation token for the process
     */
    getCancellationToken(process_uid: string): CancellationToken {
        const existing = this.cancellationTokens.get(process_uid);
        if (existing && !existing.isCancelled) {
            return existing;
        }

        const token = createCancellationToken();

        // Cancel token when process terminates
        token.onCancelled(() => {
            this.cancellationTokens.delete(process_uid);
        });

        this.cancellationTokens.set(process_uid, token);
        return token;
    }

    createRuntimeMemory(input: {
        owner_process_uid: string;
        memory_uid?: string;
        payload: Record<string, any>;
        classifications?: string[];
        parent_memory_uid?: string;
        owner_session_id?: string;
        memory_scope?: RuntimeMemoryScope;
        retention_policy?: RuntimeMemoryRetentionPolicy;
    }): string | null {
        // [Phase D] Deprecation: Use KernelEngine.createRuntimeMemory() for new code
        this.warnDeprecation('createRuntimeMemory', 'createRuntimeMemory');

        const {
            owner_process_uid,
            memory_uid,
            payload,
            classifications,
            parent_memory_uid,
            owner_session_id,
            memory_scope,
            retention_policy,
        } = input;

        const owner = this.readProcess(owner_process_uid);
        if (!owner) return null;
        const state = owner.lifecycle_state ?? this.canonicalStateFromStatus(owner.status);
        if (this.isTerminalState(state)) return null;

        const uid = (StorageEngine.dispatchRAMAction({
            action: 'create_memory',
            process_uid: owner_process_uid,
            memory_uid,
            payload,
            classifications,
            parent_memory_uid,
        }) ?? null) as string | null;

        if (!uid) return null;

        const now = Date.now();
        const meta: ProcessRuntimeMemoryMeta = {
            memory_uid: uid,
            owner_process_uid,
            owner_session_id,
            memory_scope: memory_scope ?? 'process',
            retention_policy: retention_policy ?? 'drop_on_done',
            state: 'active',
            created_at: now,
            updated_at: now,
            process_generation: owner.process_generation ?? 1,
        };
        this.runtimeMemoryMeta.set(uid, meta);

        const lineage = [owner_process_uid, ...this.getAncestorProcessUids(owner_process_uid)];
        lineage.forEach((pid) => this.linkRuntimeMemoryToProcess(pid, uid));

        return uid;
    }

    updateRuntimeMemory(input: {
        owner_process_uid: string;
        memory_uid: string;
        payload: Record<string, any>;
        classifications?: string[];
    }): boolean {
        // [Phase D] Deprecation: Use KernelEngine.updateRuntimeMemory() for new code
        this.warnDeprecation('updateRuntimeMemory', 'updateRuntimeMemory');

        const { owner_process_uid, memory_uid, payload, classifications } = input;

        const owner = this.readProcess(owner_process_uid);
        if (!owner) return false;
        const state = owner.lifecycle_state ?? this.canonicalStateFromStatus(owner.status);
        if (this.isTerminalState(state)) return false;

        const meta = this.runtimeMemoryMeta.get(memory_uid);
        if (meta) {
            if (meta.owner_process_uid !== owner_process_uid) return false;
            if (meta.state !== 'active') return false;
            if ((owner.process_generation ?? 1) !== meta.process_generation) return false;
            this.runtimeMemoryMeta.set(memory_uid, {
                ...meta,
                updated_at: Date.now(),
            });
        }

        return Boolean(
            StorageEngine.dispatchRAMAction({
                action: 'update_memory',
                process_uid: owner_process_uid,
                memory_uid,
                payload,
                classifications,
            }),
        );
    }

    getRuntimeMemoryMeta(memory_uid: string): ProcessRuntimeMemoryMeta | undefined {
        return this.runtimeMemoryMeta.get(memory_uid);
    }

    getCurrentProcessUid(): string | undefined {
        return this.processContextStack.length > 0
            ? this.processContextStack[this.processContextStack.length - 1]
            : undefined;
    }

    async withProcessContext<T>(process_uid: string | undefined, fn: () => Promise<T> | T): Promise<T> {
        if (!process_uid) {
            return await fn();
        }

        this.processContextStack.push(process_uid);
        try {
            return await fn();
        } finally {
            const popped = this.processContextStack.pop();
            if (popped !== process_uid) {
                const idx = this.processContextStack.lastIndexOf(process_uid);
                if (idx >= 0) {
                    this.processContextStack.splice(idx, 1);
                }
            }
        }
    }

    /**
     * Wrap any async function as a tracked process.
     * Creates a process record, runs fn, then marks done/failed.
     * Returns the fn result. Throws on fn failure (after marking failed).
     */
    async track<T>(
        type: string,
        metadata: Record<string, any>,
        fn: (process_uid: string) => Promise<T>,
        options?: {
            parent_process_uid?: string;
            process_kind?: ProcessKind;
            owner_engine?: string;
            payload?: Record<string, any>;
        },
    ): Promise<T> {
        // [Phase D] Deprecation: Use KernelEngine.trackAsync() for new code
        this.warnDeprecation('track', 'trackAsync');

        const record = options?.parent_process_uid
            ? this.spawnSubprocess({
                parent_process_uid: options.parent_process_uid,
                type,
                metadata,
                process_kind: options.process_kind,
                owner_engine: options.owner_engine,
                payload: options.payload,
            })
            : this.registerProcess(type, metadata, {}, [], undefined, undefined, undefined, {
                process_kind: options?.process_kind,
                owner_engine: options?.owner_engine,
                payload: options?.payload,
            });

        this.updateLifecycleState(record.process_uid, 'running');
        try {
            const result = await fn(record.process_uid);
            this.updateLifecycleState(record.process_uid, 'done');
            return result;
        } catch (err) {
            this.updateLifecycleState(record.process_uid, 'failed', { error: String(err) });
            throw err;
        }
    }

    /**
     * Returns a snapshot of all known process records from RAM via classification index.
     */
    getAll(): ProcessRecord[] {
        const uids = StorageEngine.readClassification(this.processRegistryTag) ?? [];
        return uids
            .map(uid => StorageEngine.readMemory(uid) as ProcessRecord | undefined)
            .filter((v): v is ProcessRecord => v !== undefined);
    }

    /**
     * Returns a snapshot of all runtime memory metadata.
     * Used for diagnostics, sweeping, and governance queries.
     *
     * @returns Array of [memory_uid, metadata] tuples
     */
    getAllRuntimeMemory(): Array<[string, ProcessRuntimeMemoryMeta]> {
        return Array.from(this.runtimeMemoryMeta.entries());
    }

    /**
     * Get memory UIDs owned by a specific process.
     * Used for diagnostics and traversal.
     */
    getMemoryOwnedByProcess(process_uid: string): string[] {
        return Array.from(this.processOwnedMemory.get(process_uid) ?? new Set<string>());
    }
}

export const ProcessEngine = new ProcessEngineSingleton();
