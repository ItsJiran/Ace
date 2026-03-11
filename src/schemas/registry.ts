import { z } from 'zod';
import { EventReactionSchema } from './events';



// ----------------------------------------------------------------------
// 3. Heartbeat & Connection Sync Schema
// ----------------------------------------------------------------------

export const GatewayHeartbeatSchema = z.object({
    status: z.enum(['alive', 'syncing', 'error']),
    latency_ms: z.number().optional(),
    active_version: z.string().optional(),
});

export type GatewayHeartbeat = z.infer<typeof GatewayHeartbeatSchema>;

// ----------------------------------------------------------------------
// 4. Downloadable Module Registry Schemas
// ----------------------------------------------------------------------

export const WidgetComponentSchema = z.object({
    /** The programmatic name of the UI component */
    name: z.string(),
    /** Array of state keys this component extracts from Global Storage */
    data_requirements: z.array(z.string()),

    /** 
     * Explicit list of Interaction Sub-Actions this widget is capable of emitting.
     * Enables the Gateway to know what actions to expect (e.g., ["send_gateway", "custom_open_modal"]).
     */
    emits_interactions: z.array(z.string()),

    /** 
     * Explicit list of external Listener events this component reacts to, 
     * and exactly what reaction the Engine should trigger when they occur.
     */
    listens_to: z.array(z.object({
        listened_event: z.string(),
        reaction: EventReactionSchema,
    })),

    /** String identifying its behavior mapping (e.g., "chat_bubble", "data_table") */
    react_behavior: z.string(),
});

export type WidgetComponent = z.infer<typeof WidgetComponentSchema>;

export const WidgetRegistrySchema = z.object({
    /** Version of the downloaded widget package */
    version: z.string(),
    /** URL or reference to the source repository */
    repository_path: z.string(),
    /** Absolute local file path where the widget is installed */
    file_location: z.string(),
    /** Author name or identifier */
    author: z.string(),
    /** List of UI components provided by this registry module */
    components: z.array(WidgetComponentSchema),
});

export type WidgetRegistry = z.infer<typeof WidgetRegistrySchema>;
