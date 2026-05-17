import type { Interaction, CoreEngineHandlerArgs } from '#/schemas/events';
import { KernelEngine } from './kernel-engine';

type ProcessCallback = (args: CoreEngineHandlerArgs<any>) => Promise<void>;
type SyncProcessCallback = (args: CoreEngineHandlerArgs<any>) => void;

class EventEngineSingleton {
    /**
     * Sockets specifically for routing Interactions to background Processes.
     * Maps an `action` (or `action:sub_action` combo) to an array of async handler functions.
     */
    private routes = new Map<string, Array<ProcessCallback | SyncProcessCallback>>();
    private readonly maxEventLogs = 300;

    // Log batching: buffer entries and flush in bulk instead of writing per-emit.
    // Converts 3 StorageEngine writes per emit() → 1 write per LOG_FLUSH_MS interval.
    private logBuffer: Array<Record<string, unknown>> = [];
    private logFlushTimer: ReturnType<typeof setTimeout> | null = null;
    private static readonly LOG_FLUSH_MS = 200;
    private static readonly LOG_FLUSH_THRESHOLD = 15;
    public readonly eventStreamMemoryUid = 'system:event_stream';

    setupKernelSpace() {
        KernelEngine.registerSystemMemory(this.eventStreamMemoryUid, [] as Array<Record<string, unknown>>);
    }

    /**
     * A background Process (The Chef) "mounts" itself to listen for a specific action.
     * @param routeKey Can be an action like 'send' or a specific action:sub_action like 'send:send_gateway'.
     * @returns A cleanup function to unregister the route.
     */
    registerProcessRoute(routeKey: string, handler: ProcessCallback | SyncProcessCallback) {
        if (!this.routes.has(routeKey)) {
            this.routes.set(routeKey, []);
        }

        this.routes.get(routeKey)!.push(handler);

        return () => {
            const handlers = this.routes.get(routeKey) || [];
            this.routes.set(routeKey, handlers.filter(cb => cb !== handler));
            if (this.routes.get(routeKey)!.length === 0) {
                this.routes.delete(routeKey);
            }
        };
    }

    private normalizeInteraction(interaction: Interaction): Interaction {
        const parentProcessUidFromMemory =
            typeof interaction.preallocated_memory?.parent_process_uid === 'string'
                ? interaction.preallocated_memory.parent_process_uid
                : undefined;
        const effectiveProcessUid = interaction.process_uid ?? parentProcessUidFromMemory;

        const normalizedPreallocatedMemory: Record<string, unknown> = {
            ...(interaction.preallocated_memory || {}),
        };
        if (!normalizedPreallocatedMemory.parent_process_uid && effectiveProcessUid) {
            normalizedPreallocatedMemory.parent_process_uid = effectiveProcessUid;
        }

        return {
            ...interaction,
            process_uid: effectiveProcessUid,
            preallocated_memory: normalizedPreallocatedMemory,
        };
    }

    emitWithParent(parentProcessUid: string | undefined, interaction: Interaction) {
        const normalized: Interaction = {
            ...interaction,
            process_uid: interaction.process_uid ?? parentProcessUid,
            preallocated_memory: {
                ...(interaction.preallocated_memory || {}),
                ...(interaction.preallocated_memory?.parent_process_uid
                    ? {}
                    : parentProcessUid
                        ? { parent_process_uid: parentProcessUid }
                        : {}),
            },
        };
        this.emit(normalized);
    }

    /**
     * A React Component (The Waiter) or Gateway "emits" an interaction.
     * This follows the Unified Lifecycle: Ingestion -> Validation -> Allocation.
     *
     * Convention: always supply `process_uid` so receivers can identify
     * and manage (e.g. terminate) the originating process. Use `useAceEvent`
     * from React components — it injects `process_uid` automatically from
     * `ProcessContextProvider`. Engine-level emits should call `emitWithParent`.
     */
    emit(interaction: Interaction) {
        const normalized = this.normalizeInteraction(interaction);

        // Hard enforcement: process_uid is mandatory for all emitted events.
        // Every event must carry an origin identity so receivers can:
        //  - send destroy / cancel signals back to the originating process
        //  - spawn child windows or async work under the correct parent
        //  - create runtime memory scoped to the correct process
        // React components: use useAceEvent (auto-injects from ProcessContextProvider).
        // Engines: pass process_uid explicitly or use emitWithParent().
        if (!normalized.process_uid) {
            console.error(
                `[EventBus] REJECTED emit('${normalized.action}') — missing process_uid. ` +
                `Every event must carry an origin identity. ` +
                `Use useAceEvent (auto-injects from context) or pass process_uid explicitly.`
            );
            this.logEvent(normalized, 'rejected');
            return;
        }

        this.logEvent(normalized, 'emitted');

        // --- PHASE 2: INGESTION & VALIDATION ---

        // Standard routing logic for other actions
        const specificRouteKey = normalized.sub_action
            ? `${normalized.action}:${normalized.sub_action}`
            : normalized.action;
            
        const specificHandlers = this.routes.get(specificRouteKey) || [];
        const broadHandlers = specificRouteKey !== interaction.action // Avoid duplicate if no sub_action
            ? (this.routes.get(normalized.action) || [])
            : [];
            
        const allHandlers = [...specificHandlers, ...broadHandlers];

        if (allHandlers.length === 0) {
            console.warn(`[EventBus] No process is listening to action route: ${normalized.action} or ${specificRouteKey}`);
            this.logEvent(normalized, 'dropped');
            return;
        }

        // Construct the Unified Handler Argument
        const coreArgs: CoreEngineHandlerArgs<any> = {
            payload: normalized.payload,
            preallocated_memory: (normalized.preallocated_memory || {}) as Record<string, any>,
            source: {
                window_uid: normalized.window_uid,
                widget_uid: normalized.widget_uid,
                process_uid: normalized.process_uid,
                component_uid: normalized.component_uid,
            },
            action: normalized.action,
            sub_action: normalized.sub_action,
        };

        // Fire and forget! (Async execution)
        allHandlers.forEach(handler => {
            try {
                // Pass the unified coreArgs instead of raw interaction
                const result = handler(coreArgs);
                Promise.resolve(result).catch((err: any) =>
                    console.error(`[EventBus] Process handler crashed on route ${normalized.action}:`, err)
                );
            } catch (err) {
                console.error(`[EventBus] Sync Process handler crashed on route ${normalized.action}:`, err);
            }
        });
    }

    private logEvent(interaction: Interaction, status: 'emitted' | 'routed' | 'dropped' | 'rejected') {
        const entry = {
            id: `evt-${crypto.randomUUID()}`,
            at: Date.now(),
            status,
            action: interaction.action,
            sub_action: interaction.sub_action ?? null,
            process_uid: interaction.process_uid ?? null,
            payload: interaction.payload,
        };

        this.logBuffer.push(entry);

        // Flush immediately on threshold to prevent unbounded buffer growth
        if (this.logBuffer.length >= EventEngineSingleton.LOG_FLUSH_THRESHOLD) {
            this.flushLogBuffer();
            return;
        }

        // Schedule a deferred flush if not already pending
        if (!this.logFlushTimer) {
            this.logFlushTimer = setTimeout(
                () => this.flushLogBuffer(),
                EventEngineSingleton.LOG_FLUSH_MS
            );
        }
    }

    private flushLogBuffer() {
        if (this.logFlushTimer !== null) {
            clearTimeout(this.logFlushTimer);
            this.logFlushTimer = null;
        }

        if (this.logBuffer.length === 0) return;

        const toFlush = this.logBuffer.splice(0);
        const raw = KernelEngine.readMemory(this.eventStreamMemoryUid);
        const current = Array.isArray(raw) ? raw : [];
        const next = [...current, ...toFlush].slice(-this.maxEventLogs);

        KernelEngine.writeMemory(this.eventStreamMemoryUid, next);
    }
}


// Export as a pure Singleton
export const EventBus = new EventEngineSingleton();
