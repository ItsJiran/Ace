import { z } from 'zod';
import { InteractionSchema } from './events';

/**
 * A granular, modular configuration entry.
 * Use this for individual settings that can be added dynamically.
 */
export const ConfigItemSchema = z.object({
    /** The unique lookup key for this setting (e.g., 'core.theme', 'obsidian.path') */
    key: z.string(),
    /** The actual data value for the setting */
    value: z.any(),
    /** Optional category for UI grouping (e.g., 'Appearance', 'Integrations') */
    category: z.string().optional(),
    /** Optional description for the user */
    description: z.string().optional(),
    /** Whether the configuration is currently active */
    enabled: z.boolean().default(true).optional(),
});

export const ConfigItemKeybindSchema = z.object({
    ...ConfigItemSchema.shape,

    /**
     * The accelerator string (Tauri/Electron format)
     * Example: "CommandOrControl+Shift+Space"
     */
    value: z.string(),

    /**
     * The interaction ticket that will be dropped on the EventBus
     * when this shortcut is triggered.
     */
    intent: InteractionSchema,
});

export type ConfigItem = z.infer<typeof ConfigItemSchema>;
export type ConfigItemKeybind = z.infer<typeof ConfigItemKeybindSchema>;

/**
 * A granular, modular configuration entry.
 * Use this for individual settings that can be added dynamically.
 */

export const ConfigStorageSchema = z.object({
    memory_uid : z.string(),
    file_name : z.string(),
    items: z.array(ConfigItemSchema.or(ConfigItemKeybindSchema)),
});

export type ConfigStorage = z.infer<typeof ConfigStorageSchema>;

export type ConfigStorageMap = {
    [storageKey: string]: ConfigStorage;
}