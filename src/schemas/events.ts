import { string, z } from 'zod';

// ============================================================================
// CORE EVENT SYSTEM
// This file defines the global event bus schemas used across the entire ecosystem.
// ============================================================================

/**
 * Standard Supported Sub-Actions
 * These are the primary supported routing mechanisms out of the box.
 * Note: Widgets can extend and provide their own custom strings in the future,
 * but these form the core routing backbone.
 */
export const Actions = [
    'open_window',
    'close_window',
    'open_widget',
    'close_widget',
    'send_window',
    'send_process',
    'send_gateway',
    'send_terminal',
    'execute_tool',
    'run_shell',
    'read_file'
] as const;

// ----------------------------------------------------------------------
// 1. INTERACTION SCHEMA (Initiating Actions)
// How an entity (UI Widget, Gateway, OS) initiates an action or routes data.
// ----------------------------------------------------------------------
export const InteractionSchema = z.object({
    event_type: z.literal('interaction'),
    window_uid: z.string().optional(),
    process_uid: z.string().optional(),
    widget_uid: z.string().optional(),
    component_uid: z.string().optional(),

    // Validasi bahwa action adalah salah satu dari const Actions, ATAU string custom
    action: z.union([z.enum(Actions), z.string()]),
    sub_action: z.string().optional(),
    payload: z.record(z.string(), z.any()),

    // Shared buffer state passed along the engine chain
    preallocated_memory: z.record(z.string(), z.any()).optional().describe('Shared memory buffer / context passed through the lifecycle chain.'),
});

export type Interaction = z.infer<typeof InteractionSchema>;

// ----------------------------------------------------------------------
// 3. CORE ENGINE LISTENER INTERFACE (New)
// Standard interface for all interactions passing data to core engine functionality.
// This is the "Single Source of Truth" for arguments consistency.
// ----------------------------------------------------------------------

export interface CoreEngineHandlerArgs<T = any> {
    // The specific data payload for this action (e.g. { message: "hello" })
    payload: T;

    // The shared memory context passed through the chain
    // Defaults to empty object if not provided in Interaction
    preallocated_memory: Record<string, any>;

    // Identifying metadata about the origin of this event
    source: {
        window_uid?: string;
        widget_uid?: string;
        process_uid?: string; // If triggered by another process
        component_uid?: string;
    };
    
    // Core routing info
    action: string;
    sub_action?: string;
}

// Update handler type to use the new standardized arguments interface
export type ListenerHandler<T> = (context: CoreEngineHandlerArgs<T>) => Promise<any> | void;

// Ubah nama menjadi 'Listener' langsung (bukan ListenerSchema) karena ini murni TS Type
export interface Listener<T extends z.ZodType<any, any, any>> {
    event_type: 'listener';

    // Event apa yang didengarkan?
    listened_event: typeof Actions[number] | string;

    // (Opsional) Simpan Zod schema di sini agar EventBus bisa memvalidasi 
    // payload sebelum melemparkannya ke fungsi reaction
    validation_schema?: T;

    // Fungsi yang akan dieksekusi saat event cocok
    reaction: ListenerHandler<z.infer<T>>;
}

