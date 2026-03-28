import { ProcessEngine } from './processEngine';
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

/**
 * KernelEngine: Control-plane facade for process lifecycle and runtime memory governance
 *
 * Phase A Implementation:
 * - Delegation facade over ProcessEngine internals
 * - Centralized governance entry point for lifecycle and memory ownership
 * - Telemetry + invariant logging for control-plane observability
 * - Foundation for Phase B migration (domain engines adopt KernelEngine)
 *
 * Architecture:
 * - NOT a domain API replacement; keeps domain execution decentralized
 * - Coordinates ProcessEngine (lifecycle), StorageEngine (data), termination handlers (cleanup)
 * - Enforces runtime memory ownership contracts before Phase D governance
 *
 * Key Principles:
 * 1. Every spawned process has a uid, lifecycle state, and owner_engine for traceability
 * 2. Every runtime memory has mandatory owner_process_uid for cascade cleanup
 * 3. Termination is cascade-first: children → parent with handler execution
 * 4. Domains hook termination via registerTerminationHandler() for resource cleanup
 */
class KernelEngineSingleton {
    private readonly telemetryPrefix = '[KernelEngine]';

    private logDebug(action: string, context: Record<string, any>) {
        const now = new Date().toISOString();
        console.debug(`${this.telemetryPrefix} ${action} @ ${now}`, context);
    }

    private logWarn(action: string, context: Record<string, any>) {
        const now = new Date().toISOString();
        console.warn(`${this.telemetryPrefix} ${action} @ ${now}`, context);
    }

    private logError(action: string, context: Record<string, any>) {
        const now = new Date().toISOString();
        console.error(`${this.telemetryPrefix} ${action} @ ${now}`, context);
    }

    /**
     * Spawn a top-level process (no parent).
     * Delegates to ProcessEngine.registerProcess with owner_engine tracking.
     *
     * @param type Process type (e.g., "ai_session", "window_shell")
     * @param metadata Optional metadata attached to process record
     * @param options Configuration including owner_engine for domain responsibility tracking
     * @returns ProcessRecord with assigned process_uid
     */
    spawnProcess(
        type: string,
        metadata?: Record<string, any>,
        options?: {
            owner_engine?: string;
            process_kind?: ProcessKind;
            payload?: Record<string, any>;
            preallocated_memory?: Record<string, any>;
            origin_window_uid?: string;
            origin_widget_uid?: string;
        },
    ): ProcessRecord {
        const record = ProcessEngine.registerProcess(
            type,
            metadata ?? {},
            options?.preallocated_memory ?? {},
            [],
            undefined,
            options?.origin_window_uid,
            options?.origin_widget_uid,
            {
                owner_engine: options?.owner_engine,
                process_kind: options?.process_kind,
                payload: options?.payload,
            },
        );

        this.logDebug('spawnProcess', {
            process_uid: record.process_uid,
            type,
            owner_engine: options?.owner_engine,
        });

        return record;
    }

    /**
     * Spawn a subprocess with explicit parent linkage.
     * Delegates to ProcessEngine.spawnSubprocess with cascade ownership.
     *
     * @param parent_process_uid Parent process UID
     * @param type Process type
     * @param options Subprocess-specific configuration
     * @returns ProcessRecord with parent_process_uid set
     */
    spawnSubprocess(
        parent_process_uid: string,
        type: string,
        options?: {
            metadata?: Record<string, any>;
            owner_engine?: string;
            process_kind?: ProcessKind;
            payload?: Record<string, any>;
            preallocated_memory?: Record<string, any>;
            origin_window_uid?: string;
            origin_widget_uid?: string;
        },
    ): ProcessRecord {
        const record = ProcessEngine.spawnSubprocess({
            parent_process_uid,
            type,
            metadata: options?.metadata,
            owner_engine: options?.owner_engine,
            process_kind: options?.process_kind,
            payload: options?.payload,
            preallocated_memory: options?.preallocated_memory,
            origin_window_uid: options?.origin_window_uid,
            origin_widget_uid: options?.origin_widget_uid,
        });

        this.logDebug('spawnSubprocess', {
            process_uid: record.process_uid,
            parent_process_uid,
            type,
            owner_engine: options?.owner_engine,
        });

        return record;
    }

    /**
     * Update process lifecycle state and optionally metadata.
     *
     * @param process_uid Target process
     * @param status New process status
     * @param metadata_patch Optional metadata to merge
     */
    updateProcessStatus(process_uid: string, status: ProcessStatus, metadata_patch?: Record<string, any>): boolean {
        const result = ProcessEngine.updateStatus(process_uid, status, metadata_patch);
        if (result) {
            this.logDebug('updateProcessStatus', {
                process_uid,
                status,
                hasMetadataPatch: !!metadata_patch,
            });
        }
        return result;
    }

    /**
     * Update process payload (domain-specific data).
     *
     * @param process_uid Target process
     * @param updater Function or object to merge into current payload
     */
    updateProcessPayload(
        process_uid: string,
        updater:
            | Record<string, any>
            | ((current: Record<string, any>) => Record<string, any>),
    ): boolean {
        const result = ProcessEngine.updatePayload(process_uid, updater);
        if (result) {
            this.logDebug('updateProcessPayload', {
                process_uid,
                isFunction: typeof updater === 'function',
            });
        }
        return result;
    }

    /**
     * Request process cancellation (graceful shutdown start).
     * Process continues running until timeout expires or domain handles request.
     *
     * @param process_uid Target process
     * @param reason Cancellation reason for audit trail
     */
    requestProcessCancel(process_uid: string, reason = 'cancel_requested'): boolean {
        const result = ProcessEngine.requestCancel(process_uid, reason);
        if (result) {
            this.logDebug('requestProcessCancel', {
                process_uid,
                reason,
            });
        }
        return result;
    }

    /**
     * Retrieve current process record.
     * Returns undefined if process not found.
     */
    getProcess(process_uid: string): ProcessRecord | undefined {
        return ProcessEngine.getProcess(process_uid);
    }

    /**
     * Check if process is currently active (not in terminal state).
     */
    isProcessActive(process_uid: string): boolean {
        return ProcessEngine.isProcessActive(process_uid);
    }

    /**
     * Subscribe to process state changes.
     * Callback fires on spawn, update, or termination.
     *
     * @param process_uid Target process
     * @param callback Fires with updated record or null if deleted
     * @returns Unsubscribe function
     */
    subscribeToProcess(
        process_uid: string,
        callback: (record: ProcessRecord | null) => void,
    ): (() => void) | undefined {
        return ProcessEngine.subscribe(process_uid, callback);
    }

    /**
     * Terminate a process and optionally all descendants.
     * Executes domain-specific termination handlers before marking terminated.
     *
     * @param process_uid Target process
     * @param options Termination configuration (mode, reason, cascade)
     */
    terminateProcess(
        process_uid: string,
        options?: {
            mode?: 'graceful' | 'force';
            reason?: string;
            cascade?: boolean;
            timeout_ms?: number;
        },
    ): boolean {
        const record = ProcessEngine.getProcess(process_uid);
        if (!record) {
            this.logWarn('terminateProcess:not_found', { process_uid });
            return false;
        }

        const result = ProcessEngine.terminateProcess(process_uid, {
            mode: options?.mode ?? 'graceful',
            reason: options?.reason ?? 'kernel_terminate',
            cascade: options?.cascade ?? true,
            timeout_ms: options?.timeout_ms ?? 350,
        });

        if (result) {
            this.logDebug('terminateProcess', {
                process_uid,
                mode: options?.mode ?? 'graceful',
                cascade: options?.cascade ?? true,
                reason: options?.reason ?? 'kernel_terminate',
            });
        }

        return result;
    }

    /**
     * Force-terminate a process and all descendants (hard shutdown).
     * No graceful period; suitable for cleanup, crash recovery.
     *
     * @param process_uid Root of subtree to terminate
     * @param reason Termination reason for audit trail
     */
    terminateSubtree(process_uid: string, reason = 'kernel_terminate_subtree'): boolean {
        const result = ProcessEngine.terminateSubtree(process_uid, reason);
        if (result) {
            this.logDebug('terminateSubtree', {
                process_uid,
                reason,
            });
        }
        return result;
    }

    /**
     * Force-kill a process immediately (for unresponsive processes).
     * Equivalent to terminateProcess(uid, { mode: 'force', cascade: true })
     *
     * @param process_uid Target process
     */
    killProcess(process_uid: string): boolean {
        const result = ProcessEngine.killProcess(process_uid);
        if (result) {
            this.logDebug('killProcess', { process_uid });
        }
        return result;
    }

    /**
     * Register a termination handler for a specific owner_engine.
     * Called when any process owned by that engine terminates.
     *
     * Used for domain-specific cleanup:
     * - windowEngine: close visual shell, flush buffers
     * - aiGatewayEngine: abort streams, close sessions
     * - pipelineEngine: cancel queued operations
     * - fsEngine: release file handles
     *
     * @param owner_engine Engine identifier (e.g., "window_engine")
     * @param handler Function called on termination with process record + reason
     * @returns Unregister function
     */
    registerTerminationHandler(
        owner_engine: string,
        handler: (input: {
            record: ProcessRecord;
            root_process_uid: string;
            reason: string;
            cascade: boolean;
        }) => void,
    ): () => void {
        const unregister = ProcessEngine.registerTerminationHandler(owner_engine, handler);
        this.logDebug('registerTerminationHandler', {
            owner_engine,
        });
        return unregister;
    }

    /**
     * Create runtime memory tied to a process.
     * Memory is automatically linked to owner_process_uid + all ancestors.
     * Cascade cleanup enforces: if process terminates, memory follows retention policy.
     *
     * Contract: Owner must be active process; owner_process_uid is mandatory.
     *
     * @param input Runtime memory creation parameters
     * @returns memory_uid or null if owner process not found/terminal
     */
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
        const uid = ProcessEngine.createRuntimeMemory(input);

        if (uid) {
            this.logDebug('createRuntimeMemory', {
                memory_uid: uid,
                owner_process_uid: input.owner_process_uid,
                scope: input.memory_scope ?? 'process',
                retention_policy: input.retention_policy ?? 'drop_on_done',
            });
        } else {
            this.logWarn('createRuntimeMemory:failed', {
                owner_process_uid: input.owner_process_uid,
                reason: 'owner_not_active',
            });
        }

        return uid;
    }

    /**
     * Update runtime memory payload.
     * Validates owner_process_uid and process generation to catch stale writes.
     *
     * Contract: owner_process_uid must match memory's owner; process must be active.
     *
     * @param input Runtime memory update parameters
     * @returns true if update succeeded
     */
    updateRuntimeMemory(input: {
        owner_process_uid: string;
        memory_uid: string;
        payload: Record<string, any>;
        classifications?: string[];
    }): boolean {
        const result = ProcessEngine.updateRuntimeMemory(input);

        if (result) {
            this.logDebug('updateRuntimeMemory', {
                memory_uid: input.memory_uid,
                owner_process_uid: input.owner_process_uid,
            });
        } else {
            this.logWarn('updateRuntimeMemory:rejected', {
                memory_uid: input.memory_uid,
                owner_process_uid: input.owner_process_uid,
                reason: 'owner_mismatch_or_terminal',
            });
        }

        return result;
    }

    /**
     * Retrieve runtime memory metadata (ownership, retention, lifecycle).
     * Useful for governance and debug inspection.
     */
    getRuntimeMemoryMeta(memory_uid: string): ProcessRuntimeMemoryMeta | undefined {
        return ProcessEngine.getRuntimeMemoryMeta(memory_uid);
    }

    /**
     * Get current process context (if running inside withProcessContext call).
     */
    getCurrentProcessContext(): string | undefined {
        return ProcessEngine.getCurrentProcessUid();
    }

    /**
     * Run a function within a process context.
     * Useful for async operations that need implicit process binding.
     *
     * @param process_uid Process to set as current context
     * @param fn Function to execute
     * @returns Result of fn
     */
    async withProcessContext<T>(process_uid: string | undefined, fn: () => Promise<T> | T): Promise<T> {
        return ProcessEngine.withProcessContext(process_uid, fn);
    }

    /**
     * Wrap an async function as a tracked process.
     * Creates process record, runs fn, marks completed/error, then cleans up per retention policy.
     *
     * Useful for fire-and-forget workloads that still need lifecycle observability + memory cleanup.
     *
     * @param type Process type
     * @param metadata Metadata to attach
     * @param fn Async function to track (receives process_uid)
     * @param options Parent process, owner_engine, etc.
     * @returns Result of fn
     * @throws If fn throws; process marked as failed
     */
    async trackAsync<T>(
        type: string,
        metadata: Record<string, any>,
        fn: (process_uid: string) => Promise<T>,
        options?: {
            parent_process_uid?: string;
            owner_engine?: string;
            process_kind?: ProcessKind;
            payload?: Record<string, any>;
        },
    ): Promise<T> {
        this.logDebug('trackAsync:start', {
            type,
            owner_engine: options?.owner_engine,
            parent_process_uid: options?.parent_process_uid,
        });

        try {
            const result = await ProcessEngine.track(type, metadata, fn, options);
            this.logDebug('trackAsync:done', { type });
            return result;
        } catch (err) {
            this.logError('trackAsync:failed', {
                type,
                error: String(err),
            });
            throw err;
        }
    }

    /**
     * Get all known processes in the system.
     * Snapshot at call time; mutations after call are not reflected.
     *
     * Useful for dashboard/monitor, orphan detection, runtime statistics.
     */
    getAllProcesses(): ProcessRecord[] {
        return ProcessEngine.getAll();
    }

    /**
     * [Phase D] Get process lineage (all ancestors up to root).
     * Traces parent chain from given process to root.
     *
     * @param process_uid Process to start from
     * @returns Array of process UIDs from root to target [root, ..., process_uid]
     */
    getProcessLineage(process_uid: string): string[] {
        const lineage: string[] = [];
        let current = process_uid;

        // Build ancestor chain
        const seen = new Set<string>();
        while (current && !seen.has(current)) {
            lineage.unshift(current); // Prepend to get root-first order
            seen.add(current);

            const record = this.getProcess(current);
            if (!record?.parent_process_uid) {
                break;
            }
            current = record.parent_process_uid;
        }

        return lineage;
    }

    /**
     * [Phase D] Get all descendant processes (children, grandchildren, etc).
     * Recursively collects all descendants of a given process.
     *
     * @param process_uid Root process to collect descendants for
     * @returns Array of process UIDs for all descendants
     */
    getProcessDescendants(process_uid: string): string[] {
        const descendants: string[] = [];
        const allProcesses = this.getAllProcesses();

        const collect = (uid: string) => {
            const children = allProcesses.filter(p => p.parent_process_uid === uid);
            for (const child of children) {
                descendants.push(child.process_uid);
                collect(child.process_uid); // Recurse
            }
        };

        collect(process_uid);
        return descendants;
    }

    /**
     * [Phase D] Query processes by criteria.
     * Useful for monitoring dashboards, diagnostics, process enumeration.
     *
     * @param criteria Filter conditions (all must match)
     * @returns Matching process records
     */
    queryProcesses(criteria: {
        status?: ProcessStatus;
        owner_engine?: string;
        lifecycle_state?: ProcessLifecycleState;
        parent_process_uid?: string;
    }): ProcessRecord[] {
        const allProcesses = this.getAllProcesses();

        return allProcesses.filter(p => {
            if (criteria.status !== undefined && p.status !== criteria.status) return false;
            if (criteria.owner_engine !== undefined && p.owner_engine !== criteria.owner_engine)
                return false;
            if (criteria.lifecycle_state !== undefined && p.lifecycle_state !== criteria.lifecycle_state)
                return false;
            if (criteria.parent_process_uid !== undefined && p.parent_process_uid !== criteria.parent_process_uid)
                return false;
            return true;
        });
    }

    /**
     * [Phase D] Get memory lineage and ownership summary for diagnostics.
     * Shows which memory is owned by which process and scope.
     *
     * @param process_uid Process to get memory summary for
     * @returns Memory ownership summary
     */
    getProcessMemorySummary(process_uid: string): {
        process_uid: string;
        ownedMemory: Array<{
            memory_uid: string;
            scope: RuntimeMemoryScope;
            state: RuntimeMemoryState;
            retention_policy: RuntimeMemoryRetentionPolicy;
        }>;
        totalOwned: number;
    } {
        const memoryUids = ProcessEngine.getMemoryOwnedByProcess(process_uid);
        const ownedMemory = memoryUids
            .map(uid => ProcessEngine.getRuntimeMemoryMeta(uid))
            .filter((m): m is ProcessRuntimeMemoryMeta => m !== undefined)
            .map(m => ({
                memory_uid: m.memory_uid,
                scope: m.memory_scope,
                state: m.state,
                retention_policy: m.retention_policy,
            }));

        return {
            process_uid,
            ownedMemory,
            totalOwned: ownedMemory.length,
        };
    }

    /**
     * [Phase D] Build process tree structure for visualization/monitoring.
     * Returns hierarchical tree showing process dependencies and ownership.
     *
     * @returns Process tree rooted at top-level processes
     */
    getProcessTree(): Array<{
        process_uid: string;
        type: string;
        status: ProcessStatus;
        owner_engine?: string;
        children: any[];
        ownedMemoryCount: number;
    }> {
        const allProcesses = this.getAllProcesses();

        // Find root processes (no parent)
        const roots = allProcesses.filter(p => !p.parent_process_uid);

        const buildTree = (
            process: ProcessRecord,
        ): {
            process_uid: string;
            type: string;
            status: ProcessStatus;
            owner_engine?: string;
            children: any[];
            ownedMemoryCount: number;
        } => {
            const children = allProcesses
                .filter(p => p.parent_process_uid === process.process_uid)
                .map(child => buildTree(child));

            const ownedMemory = ProcessEngine.getMemoryOwnedByProcess(process.process_uid);

            return {
                process_uid: process.process_uid,
                type: process.type,
                status: process.status,
                owner_engine: process.owner_engine,
                children,
                ownedMemoryCount: ownedMemory.length,
            };
        };

        return roots.map(root => buildTree(root));
    }

    /**
     * [Phase D] Query runtime memory by criteria.
     * Useful for memory diagnostics, ownership validation, and GC planning.
     *
     * @param criteria Filter conditions (all must match)
     * @returns Matching memory records with metadata
     */
    queryMemory(criteria: {
        owner_process_uid?: string;
        memory_scope?: RuntimeMemoryScope;
        state?: RuntimeMemoryState;
        retention_policy?: RuntimeMemoryRetentionPolicy;
    }): Array<{
        memory_uid: string;
        owner_process_uid: string;
        scope: RuntimeMemoryScope;
        state: RuntimeMemoryState;
        retention_policy: RuntimeMemoryRetentionPolicy;
        created_at: number;
        updated_at: number;
    }> {
        const allMemory = ProcessEngine.getAllRuntimeMemory();

        return allMemory
            .filter(([_, meta]) => {
                if (criteria.owner_process_uid !== undefined && meta.owner_process_uid !== criteria.owner_process_uid)
                    return false;
                if (criteria.memory_scope !== undefined && meta.memory_scope !== criteria.memory_scope)
                    return false;
                if (criteria.state !== undefined && meta.state !== criteria.state) return false;
                if (criteria.retention_policy !== undefined && meta.retention_policy !== criteria.retention_policy)
                    return false;
                return true;
            })
            .map(([uid, meta]) => ({
                memory_uid: uid,
                owner_process_uid: meta.owner_process_uid,
                scope: meta.memory_scope,
                state: meta.state,
                retention_policy: meta.retention_policy,
                created_at: meta.created_at,
                updated_at: meta.updated_at,
            }));
    }

    /**
     * [Phase D] Get memory statistics for governance and monitoring.
     * Summarizes memory allocations, states, and retention policies.
     *
     * @returns Memory statistics snapshot
     */
    getMemoryStatistics(): {
        totalMemory: number;
        byScope: Record<RuntimeMemoryScope, number>;
        byState: Record<RuntimeMemoryState, number>;
        byRetentionPolicy: Record<RuntimeMemoryRetentionPolicy, number>;
        orphanMemory: number;
    } {
        const allMemory = ProcessEngine.getAllRuntimeMemory();
        const allProcessUids = new Set(this.getAllProcesses().map(p => p.process_uid));

        const stats = {
            totalMemory: allMemory.length,
            byScope: {} as Record<RuntimeMemoryScope, number>,
            byState: {} as Record<RuntimeMemoryState, number>,
            byRetentionPolicy: {} as Record<RuntimeMemoryRetentionPolicy, number>,
            orphanMemory: 0,
        };

        // Initialize counts
        (['process', 'session', 'durable'] as const).forEach(scope => {
            stats.byScope[scope] = 0;
        });
        (['active', 'frozen', 'deleted', 'archived'] as const).forEach(state => {
            stats.byState[state] = 0;
        });
        (['drop_on_done', 'drop_on_cancel', 'keep_on_done', 'promote_to_context'] as const).forEach(
            policy => {
                stats.byRetentionPolicy[policy] = 0;
            },
        );

        // Count
        for (const [_, meta] of allMemory) {
            stats.byScope[meta.memory_scope]++;
            stats.byState[meta.state]++;
            stats.byRetentionPolicy[meta.retention_policy]++;

            if (!allProcessUids.has(meta.owner_process_uid)) {
                stats.orphanMemory++;
            }
        }

        return stats;
    }

    /**
     * [Phase D] Find all memory owned by a specific owner process.
     * Useful for cleanup planning and ownership validation.
     *
     * @param owner_process_uid Owner process UID
     * @returns List of memory records owned by this process
     */
    getMemoryOwnedByProcess(owner_process_uid: string): Array<{
        memory_uid: string;
        scope: RuntimeMemoryScope;
        state: RuntimeMemoryState;
        retention_policy: RuntimeMemoryRetentionPolicy;
        created_at: number;
    }> {
        const memoryUids = ProcessEngine.getMemoryOwnedByProcess(owner_process_uid);
        return memoryUids
            .map(uid => ProcessEngine.getRuntimeMemoryMeta(uid))
            .filter((m): m is ProcessRuntimeMemoryMeta => m !== undefined)
            .map(m => ({
                memory_uid: m.memory_uid,
                scope: m.memory_scope,
                state: m.state,
                retention_policy: m.retention_policy,
                created_at: m.created_at,
            }));
    }

    /**
     * [Phase D] Check memory ownership consistency across process lineage.
     * Validates that memory owner matches process lineage.
     *
     * @param memory_uid Memory UID to validate
     * @returns Ownership validation result
     */
    validateMemoryOwnership(memory_uid: string): {
        valid: boolean;
        memory_uid: string;
        owner_process_uid?: string;
        ownerExists?: boolean;
        ownerIsTerminal?: boolean;
        reason?: string;
    } {
        const meta = ProcessEngine.getRuntimeMemoryMeta(memory_uid);

        if (!meta) {
            return {
                valid: false,
                memory_uid,
                reason: 'memory_not_found',
            };
        }

        const ownerProcess = this.getProcess(meta.owner_process_uid);

        if (!ownerProcess) {
            return {
                valid: false,
                memory_uid,
                owner_process_uid: meta.owner_process_uid,
                ownerExists: false,
                reason: 'owner_process_not_found',
            };
        }

        const isTerminal = ['done', 'failed', 'cancelled', 'terminated'].includes(ownerProcess.lifecycle_state);

        if (isTerminal && meta.state === 'active') {
            return {
                valid: false,
                memory_uid,
                owner_process_uid: meta.owner_process_uid,
                ownerExists: true,
                ownerIsTerminal: true,
                reason: 'memory_active_but_owner_terminal',
            };
        }

        return {
            valid: true,
            memory_uid,
            owner_process_uid: meta.owner_process_uid,
            ownerExists: true,
            ownerIsTerminal: isTerminal,
        };
    }

    /**
     * Detects and reports:
     * - Processes with missing parent (orphan processes)
     * - Memory with missing owner process
     * - Broken lineage links
     *
     * Used by: Periodic GC task, recovery flow on corruption detection.
     *
     * @returns Summary of orphaned entities found
     */
    async runRuntimeSweep(): Promise<{ orphanMemory: number; stalePids: number }> {
        this.logDebug('runRuntimeSweep:start', {});

        let orphanMemoryCount = 0;
        let stalePidCount = 0;
        const orphanDetails: string[] = [];

        // Collect all processes
        const allProcesses = this.getAllProcesses();
        const processUidSet = new Set(allProcesses.map(p => p.process_uid));

        // Check for orphan processes (missing parent)
        for (const process of allProcesses) {
            if (process.parent_process_uid && !processUidSet.has(process.parent_process_uid)) {
                stalePidCount++;
                orphanDetails.push(
                    `orphan_process: ${process.process_uid} references missing parent ${process.parent_process_uid}`,
                );
                this.logWarn('runRuntimeSweep:orphan_process', {
                    process_uid: process.process_uid,
                    parent_process_uid: process.parent_process_uid,
                    process_status: process.status,
                });
            }
        }

        // Collect all runtime memory and check for orphans
        const allMemory = ProcessEngine.getAllRuntimeMemory();
        for (const [memory_uid, meta] of allMemory) {
            // Check if owner process exists
            if (meta.owner_process_uid && !processUidSet.has(meta.owner_process_uid)) {
                orphanMemoryCount++;
                orphanDetails.push(
                    `orphan_memory: ${memory_uid} references missing owner ${meta.owner_process_uid}`,
                );
                this.logWarn('runRuntimeSweep:orphan_memory', {
                    memory_uid,
                    owner_process_uid: meta.owner_process_uid,
                    scope: meta.memory_scope,
                    state: meta.state,
                });
            }
        }

        this.logDebug('runRuntimeSweep:done', {
            orphanMemoryCount,
            stalePidCount,
            totalOrphans: orphanMemoryCount + stalePidCount,
            detailsCount: orphanDetails.length,
        });

        // Emit event for monitoring/diagnostics if count > 0
        if (orphanMemoryCount > 0 || stalePidCount > 0) {
            this.logWarn('runRuntimeSweep:found_orphans', {
                orphanMemoryCount,
                stalePidCount,
                details: orphanDetails.slice(0, 10), // Limit to first 10 for readability
            });
        }

        return { orphanMemory: orphanMemoryCount, stalePids: stalePidCount };
    }

    /**
     * [Phase D] Enforce runtime memory ownership on StorageEngine writes.
     * Guards against unowned memory creation and stale updates.
     *
     * Rules:
     * 1. create_memory: Reject unless memory_uid has 'system:' prefix OR
     *    owner_process_uid matches process_uid OR process_uid === 'system'
     * 2. update_memory: Reject unless memory owner matches process_uid
     *    (exception: 'system' process can update anything)
     *
     * Called by: StorageEngine._guardRuntimeMemoryOwnership() during dispatchRAMAction
     *
     * @returns { allowed: true } or { allowed: false, reason: string }
     */
    enforceRuntimeMemoryOwnership(input: {
        action: 'create_memory' | 'update_memory';
        process_uid: string;
        memory_uid: string;
        classifications?: string[];
    }): { allowed: boolean; reason?: string } {
        const { action, process_uid, memory_uid } = input;

        // System process bypasses all checks
        if (process_uid === 'system') {
            return { allowed: true };
        }

        if (action === 'create_memory') {
            // System-prefixed memory is allowed for system housekeeping
            if (memory_uid.startsWith('system:')) {
                return { allowed: true };
            }

            // For non-system memory, reject creation by non-owning process
            // unless explicitly tied through owner_process_uid
            this.logWarn('enforceRuntimeMemoryOwnership:create_rejected', {
                process_uid,
                memory_uid,
                reason: 'non_system_memory_requires_matching_owner',
            });

            return {
                allowed: false,
                reason: `Cannot create non-system memory '${memory_uid}' from process '${process_uid}'. Use KernelEngine.createRuntimeMemory() with explicit owner_process_uid.`,
            };
        }

        if (action === 'update_memory') {
            // Get memory metadata to check ownership
            const meta = ProcessEngine.getRuntimeMemoryMeta(memory_uid);

            if (!meta) {
                // Memory doesn't exist; let StorageEngine handle not-found
                return { allowed: true };
            }

            // Check if owner matches process_uid
            if (meta.owner_process_uid !== process_uid) {
                this.logWarn('enforceRuntimeMemoryOwnership:update_rejected', {
                    process_uid,
                    memory_uid,
                    owner_process_uid: meta.owner_process_uid,
                    reason: 'ownership_mismatch',
                });

                return {
                    allowed: false,
                    reason: `Memory '${memory_uid}' is owned by '${meta.owner_process_uid}', not '${process_uid}'. Cannot update from unauthorized process.`,
                };
            }

            // Ownership matches; allow update
            return { allowed: true };
        }

        // Unknown action; default to reject for safety
        return {
            allowed: false,
            reason: `Unknown memory enforcement action: ${action}`,
        };
    }
}

export const KernelEngine = new KernelEngineSingleton();
