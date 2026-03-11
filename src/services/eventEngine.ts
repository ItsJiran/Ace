import type { Interaction } from '#/schemas/events';

type ProcessCallback = (interaction: Interaction) => Promise<void>;
type SyncProcessCallback = (interaction: Interaction) => void;

class EventEngineSingleton {
    /**
     * Sockets specifically for routing Interactions to background Processes.
     * Maps an `action` (or `action:sub_action` combo) to an array of async handler functions.
     */
    private routes = new Map<string, Array<ProcessCallback | SyncProcessCallback>>();

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
     * A React Component (The Waiter) "emits" an interaction.
     * This fires fire-and-forget async promises so the UI thread never blocks.
     */
    emit(interaction: Interaction) {
        // 1. Try to find handlers for the highly specific 'action:sub_action' route
        const specificRouteKey = `${interaction.action}:${interaction.sub_action}`;
        const specificHandlers = this.routes.get(specificRouteKey) || [];

        // 2. Try to find handlers for the broad 'action' route
        const broadHandlers = this.routes.get(interaction.action) || [];

        const allHandlers = [...specificHandlers, ...broadHandlers];

        if (allHandlers.length === 0) {
            console.warn(`[EventBus] No process is listening to action route: ${interaction.action} or ${specificRouteKey}`);
            return;
        }

        // Fire and forget! (Async execution)
        allHandlers.forEach(handler => {
            try {
                const result = handler(interaction);
                // Gracefully catch rejections if it's a Promise (or ignore if void)
                Promise.resolve(result).catch((err: any) =>
                    console.error(`[EventBus] Process handler crashed on route ${interaction.action}:`, err)
                );
            } catch (err) {
                // Catch any synchronous errors
                console.error(`[EventBus] Sync Process handler crashed on route ${interaction.action}:`, err);
            }
        });
    }
}

// Export as a pure Singleton
export const EventBus = new EventEngineSingleton();
