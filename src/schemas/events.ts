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
});

export type Interaction = z.infer<typeof InteractionSchema>;

// ----------------------------------------------------------------------
// 2. LISTENER INTERFACE (Perbaikan)
// ----------------------------------------------------------------------

// Tambahkan dukungan untuk void jika reaksinya sinkron (tidak butuh await)
export type ListenerHandler<T> = (args: T) => Promise<any> | void;

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

