import type { Interaction, CoreEngineHandlerArgs } from '#/schemas/events';
import { Storage } from './storageEngine';

type ProcessCallback = (args: CoreEngineHandlerArgs<any>) => Promise<void>;
type SyncProcessCallback = (args: CoreEngineHandlerArgs<any>) => void;

class EventEngineSingleton {
    /**
     * Sockets specifically for routing Interactions to background Processes.
     * Maps an `action` (or `action:sub_action` combo) to an array of async handler functions.
     */
    private routes = new Map<string, Array<ProcessCallback | SyncProcessCallback>>();
    private readonly maxEventLogs = 300;

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

    /**
     * A React Component (The Waiter) or Gateway "emits" an interaction.
     * This follows the Unified Lifecycle: Ingestion -> Validation -> Allocation.
     */
    emit(interaction: Interaction) {
        this.logEvent(interaction, 'emitted');

        // --- PHASE 2: INGESTION & VALIDATION ---

        // Standard routing logic for other actions
        const specificRouteKey = interaction.sub_action 
            ? `${interaction.action}:${interaction.sub_action}`
            : interaction.action;
            
        const specificHandlers = this.routes.get(specificRouteKey) || [];
        const broadHandlers = specificRouteKey !== interaction.action // Avoid duplicate if no sub_action
            ? (this.routes.get(interaction.action) || []) 
            : [];
            
        const allHandlers = [...specificHandlers, ...broadHandlers];

        if (allHandlers.length === 0) {
            console.warn(`[EventBus] No process is listening to action route: ${interaction.action} or ${specificRouteKey}`);
            this.logEvent(interaction, 'dropped');
            return;
        }

        this.logEvent(interaction, 'routed');

        // Construct the Unified Handler Argument
        const coreArgs: CoreEngineHandlerArgs<any> = {
            payload: interaction.payload,
            preallocated_memory: interaction.preallocated_memory || {},
            source: {
                window_uid: interaction.window_uid,
                widget_uid: interaction.widget_uid,
                process_uid: interaction.process_uid,
                component_uid: interaction.component_uid
            },
            action: interaction.action,
            sub_action: interaction.sub_action
        };

        // Fire and forget! (Async execution)
        allHandlers.forEach(handler => {
            try {
                // Pass the unified coreArgs instead of raw interaction
                const result = handler(coreArgs);
                Promise.resolve(result).catch((err: any) =>
                    console.error(`[EventBus] Process handler crashed on route ${interaction.action}:`, err)
                );
            } catch (err) {
                console.error(`[EventBus] Sync Process handler crashed on route ${interaction.action}:`, err);
            }
        });
    }

    private logEvent(interaction: Interaction, status: 'emitted' | 'routed' | 'dropped') {
        const entry = {
            id: `evt-${crypto.randomUUID()}`,
            at: Date.now(),
            status,
            action: interaction.action,
            sub_action: interaction.sub_action ?? null,
            process_uid: interaction.process_uid ?? null,
            payload: interaction.payload,
        };

        const current = (Storage.readMemory('system:event_stream') as any[] | undefined) || [];
        const next = [...current, entry].slice(-this.maxEventLogs);

        Storage.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:event_stream',
            payload: next,
            classifications: ['system:core'],
        });
    }
}


// Export as a pure Singleton
export const EventBus = new EventEngineSingleton();
