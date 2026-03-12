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
     * A React Component (The Waiter) or Gateway "emits" an interaction.
     * This follows the Unified Lifecycle: Ingestion -> Validation -> Allocation.
     */
    emit(interaction: Interaction) {
        // --- PHASE 2: INGESTION & VALIDATION ---

        // Handle specialized tool execution route
        if (interaction.action === 'execute_tool') {
            this.handleToolExecution(interaction);
            return;
        }

        // Standard routing logic for other actions
        const specificRouteKey = `${interaction.action}`;
        const specificHandlers = this.routes.get(specificRouteKey) || [];
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
                Promise.resolve(result).catch((err: any) =>
                    console.error(`[EventBus] Process handler crashed on route ${interaction.action}:`, err)
                );
            } catch (err) {
                console.error(`[EventBus] Sync Process handler crashed on route ${interaction.action}:`, err);
            }
        });
    }

    /**
     * Helper to handle the 'execute_tool' action specifically.
     * Integrates with ToolRegistry and ProcessEngine.
     */
    private async handleToolExecution(interaction: Interaction) {
        const { ToolRegistry } = await import('./toolRegistry');
        const { ProcessEngine } = await import('./processEngine');
        const { DBEngine } = await import('./dbEngine');

        const toolName = interaction.payload.tool_name as string;
        const parameters = interaction.payload.parameters;

        try {
            // 1. Tool Registry Lookup & Sanity Check (Validation)
            const validatedParams = ToolRegistry.validate(toolName, parameters);

            // 2. Allocation & State Broadcasting
            const record = ProcessEngine.spawnProcess(
                'tool_executor',
                { tool_name: toolName, parameters: validatedParams },
                interaction.process_uid // Parent PID if exists
            );

            // 3. Execution & Orchestration (Hand off to Process Engine)
            // This is fire-and-forget from the EventBus perspective
            ProcessEngine.executeTool(toolName, validatedParams, record.process_uid)
                .then(result => {
                    // Success Audit
                    DBEngine.logEventAudit({
                        interaction_uid: interaction.process_uid,
                        event_type: 'interaction',
                        action: 'execute_tool',
                        sub_action: toolName,
                        status: 'success',
                        payload: result
                    });
                })
                .catch(err => {
                    // Error Audit
                    DBEngine.logEventAudit({
                        interaction_uid: interaction.process_uid,
                        event_type: 'interaction',
                        action: 'execute_tool',
                        sub_action: toolName,
                        status: 'error',
                        error: err.message
                    });
                });

        } catch (error: any) {
            console.error(`[EventBus] Tool Ingestion Failed: ${error.message}`);
            // Audit the failure
            DBEngine.logEventAudit({
                interaction_uid: interaction.process_uid,
                event_type: 'interaction',
                action: 'execute_tool',
                sub_action: toolName,
                status: 'error',
                error: error.message
            });
        }
    }
}


// Export as a pure Singleton
export const EventBus = new EventEngineSingleton();
