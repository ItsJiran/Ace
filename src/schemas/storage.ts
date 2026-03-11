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
export const RAMInteractivitySchema = z.object({
    action: z.enum(['create_memory', 'read_memory', 'update_memory', 'delete_memory']),
    /** The originating window/widget requesting the memory action */
    window_uid: z.string(),
    widget_uid: z.string().optional(),

    /** The specific ID of the memory block being modified. (Generated securely on 'create_memory') */
    memory_uid: z.string().optional(),

    /** The arbitrary payload data to store */
    payload: z.any().optional(),

    /** 
     * When creating memory, the engine will automatically populate the Global Classification RAM 
     * with these keys to make the payload easily searchable later.
     * (e.g., ["widget_slug:calendar", "event_type:meeting"])
     */
    classifications: z.array(z.string()).optional(),
});

export type RAMInteractivity = z.infer<typeof RAMInteractivitySchema>;
