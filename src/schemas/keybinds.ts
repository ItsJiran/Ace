import { z } from 'zod';
import { InteractionSchema } from './events';

/**
 * KeybindSchema
 * Maps a physical keyboard shortcut to a specific Interaction event.
 */
export const KeybindSchema = z.object({
    /** Unique ID for the keybind config */
    keybind_uid: z.string(),

    /** 
     * The accelerator string (Tauri/Electron format) 
     * Example: "CommandOrControl+Shift+Space"
     */
    shortcut: z.string(),

    /** Human readable description of what this keybind does */
    description: z.string().optional(),

    /** 
     * The interaction ticket that will be dropped on the EventBus
     * when this shortcut is triggered.
     */
    intent: InteractionSchema,

    /** Whether the keybind is currently active */
    enabled: z.boolean().default(true),
});

export type Keybind = z.infer<typeof KeybindSchema>;

/**
 * KeybindRegistrySchema
 * A dictionary of keybinds for O(1) lookup.
 */
export const KeybindRegistrySchema = z.record(z.string(), KeybindSchema);

export type KeybindRegistry = z.infer<typeof KeybindRegistrySchema>;
