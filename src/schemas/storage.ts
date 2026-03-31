import { z } from 'zod';

// ============================================================================
// 1. GLOBAL PERSISTENT STORAGE
// This schema defines the long-term, disk-saved state of the Application
// (e.g., settings, installed repositories, widget configurations)
// ============================================================================

export const WidgetSettingsSchema = z.record(z.string(), z.any());

export const GlobalStorageSchema = z.object({
    main_app_settings: z.record(z.string(), z.any()).describe('Core settings like UI scale, shortcuts, and default themes.'),
    installed_widgets: z.array(z.string()).describe('List of widget identifiers currently installed in the client.'),
    repositories: z.array(z.string()).describe('List of remote Gateway or community widget repository URLs.'),

    /** 
     * Widget-specific settings separated by their slug.
     * Format: Record<widget_slug, { key: value }>
     */
    widget_settings: z.record(z.string(), WidgetSettingsSchema),
});

export type GlobalStorage = z.infer<typeof GlobalStorageSchema>;

// ============================================================================
// 2. RAM (EPHEMERAL) STORAGE
// A highly efficient, key-based indexing system for living data inside the app.
// It stores payloads blindly via UID, and indexes them via classifications.
// ============================================================================

/**
 * Global RAM
 * A completely flat key-value store. 
 * Maps a single, unique `memory_uid` directly to a raw payload/reference.
 * E.g., { "mem-1234": { text: "Hello AI" } }
 */
export const GlobalRAMSchema = z.record(z.string(), z.any());

/**
 * Global Classification RAM (Index)
 * Groups `memory_uids` under specific classifications to allow instant O(1) lookups.
 * The classification string could be a widget ID, a widget slug, or a specific data type.
 * E.g., { "widget_slug:obsidian": ["mem-1234", "mem-5678"], "type:chat_message": ["mem-1234"] }
 */
export const GlobalClassificationRAMSchema = z.record(
    z.string(), // The classification key (tag)
    z.array(z.string()) // Array of memory_uids that match this classification
);

/**
 * RAM Interactivity Schema
 * When a component interacts with the Storage Engine to create/remove dynamic memory.
 */
const BaseRAMActionSchema = z.object({
    process_uid: z.string().optional(),
    widget_uid: z.string().optional(),
    payload: z.any().optional(),
});

export const RAMInteractivitySchema = z.discriminatedUnion('action', [
    BaseRAMActionSchema.extend({
        action: z.literal('create_memory'),
    }),
    BaseRAMActionSchema.extend({
        action: z.literal('set_memory'),
        memory_uid: z.string(),
    }),
    BaseRAMActionSchema.extend({
        action: z.literal('write_memory'),
        memory_uid: z.string(),
    }),
    BaseRAMActionSchema.extend({
        action: z.literal('read_memory'),
        memory_uid: z.string(),
    }),
    BaseRAMActionSchema.extend({
        action: z.literal('update_memory'),
        memory_uid: z.string(),
    }),
    BaseRAMActionSchema.extend({
        action: z.literal('delete_memory'),
        memory_uid: z.string(),
    }),
]);

export type RAMInteractivity = z.infer<typeof RAMInteractivitySchema>;
