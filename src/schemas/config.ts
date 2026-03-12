import { z } from 'zod';

/**
 * ConfigItemSchema
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
});

export type ConfigItem = z.infer<typeof ConfigItemSchema>;

/**
 * GlobalConfigSchema
 * The root configuration container for the ACE ecosystem.
 */
export const GlobalConfigSchema = z.object({
    /** Metadata about the config environment */
    version: z.string().default('1.0.0'),
    /** 
     * The flat list of all configuration items.
     * This allows for extreme modularity as modules just push new items into this list.
     */
    items: z.array(ConfigItemSchema),
    /** Last time the config was synced from SQLite */
    updated_at: z.number().optional(),
});

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;
