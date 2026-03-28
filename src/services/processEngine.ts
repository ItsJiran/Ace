import { RegistryEngine } from './registryEngine';
import { StorageEngine } from './storageEngine';
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

class ProcessEngineSingleton {
    private readonly processRegistryTag = 'system:process_registry';
    private readonly processGroupTag = 'system:process_group';
    private readonly processTreeTag = 'system:process_tree';

    private readonly runtimeMemoryMeta = new Map<string, ProcessRuntimeMemoryMeta>();
    private readonly processOwnedMemory = new Map<string, Set<string>>();

    private readonly terminalStateSet = new Set<ProcessLifecycleState>([
        'done',
        'failed',
        'cancelled',
        'terminated',
    ]);

    /**
     * Retrieve a specific process definition from the registry.
     * Wraps RegistryEngine.getDomainEntry with 'processes' domain preset.
     */
    getRegistry({ packageRef, slug }: { packageRef: string; slug: string }) {
        return RegistryEngine.getDomainEntry(packageRef, 'processes', slug);
    }

    private canonicalStateFromStatus(status: ProcessStatus): ProcessLifecycleState {
        if (status === 'created' || status === 'running' || status === 'waiting') return status;
        if (status === 'done' || status === 'failed' || status === 'cancelled' || status === 'terminated') return status;
        if (status === 'booting') return 'created';
        if (status === 'yielding') return 'waiting';
        if (status === 'completed') return 'done';
        if (status === 'error') return 'failed';
        if (status === 'killed') return 'terminated';
        return 'created';
    }

    private legacyStatusFromCanonical(state: ProcessLifecycleState): ProcessStatus {
        if (state === 'created') return 'booting';
        if (state === 'waiting') return 'yielding';
        if (state === 'done') return 'completed';
        if (state === 'failed') return 'error';
        if (state === 'terminated') return 'killed';
        if (state === 'cancelled') return 'killed';
        return 'running';
    }

    private isTerminalState(state: ProcessLifecycleState): boolean {
        return this.terminalStateSet.has(state);
    }

    private canTransition(from: ProcessLifecycleState, to: ProcessLifecycleState): boolean {
        if (from === to) return true;
        if (this.isTerminalState(from)) return false;
        if (from === 'created') return to === 'running' || to === 'waiting' || this.isTerminalState(to);
        if (from === 'running') return to === 'waiting' || this.isTerminalState(to);
        if (from === 'waiting') return to === 'running' || this.isTerminalState(to);
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
            status: this.legacyStatusFromCanonical(nextState),
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
        const process_uid = 'proc-' + crypto.randomUUID();
        const now = Date.now();

        const record: ProcessRecord = {
            process_uid,
            group_pid,
            parent_process_uid: options?.parent_process_uid,
            child_process_uids: [],
            type,
            status: 'booting',
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

    /**
     * Kills a process. It keeps it in RAM for UI history but marks it as killed.
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

        const currentOwned = this.processOwnedMemory.get(owner_process_uid) ?? new Set<string>();
        currentOwned.add(uid);
        this.processOwnedMemory.set(owner_process_uid, currentOwned);

        const currentUids = Array.isArray(owner.runtime_memory_uids) ? owner.runtime_memory_uids : [];
        this.writeProcess(owner_process_uid, {
            runtime_memory_uids: [...new Set([...currentUids, uid])],
            updated_at: Date.now(),
        });

        return uid;
    }

    updateRuntimeMemory(input: {
        owner_process_uid: string;
        memory_uid: string;
        payload: Record<string, any>;
        classifications?: string[];
    }): boolean {
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

    /**
     * Wrap any async function as a tracked process.
     * Creates a process record, runs fn, then marks completed/error.
     * Returns the fn result. Throws on fn failure (after marking error).
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
}

export const ProcessEngine = new ProcessEngineSingleton();
