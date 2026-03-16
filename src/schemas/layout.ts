import { z } from 'zod';

/**
 * Widget State Persistence Schema
 * What the generic widget stores about itself.
 */
export const WidgetStateSchema = z.record(z.any()).describe('Arbitrary widget state (text content, scroll position, etc.)');

/**
 * Window Layout Entry Schema
 * Represents a single window in a saved layout.
 */
export const WindowLayoutEntrySchema = z.object({
    window_uid: z.string().describe('Unique ID for this window instance (useful for restoration).'),
    component_name: z.string().describe('The React component key (e.g. "NoteWidget").'),
    
    // Position & Size
    bounds: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
    }),

    // Appearance State
    visual_state: z.object({
        z_index: z.number(),
        opacity: z.number().optional().default(1),
        is_locked: z.boolean().default(false),
        always_on_top: z.boolean().default(false)
    }),

    // Widget-Specific Data (The Payload)
    widget_state: WidgetStateSchema.optional(),

    // Extra Context/Payload for initialization
    payload: z.record(z.any()).optional().describe('Additional arbitrary context passed to the widget on spawn.'),

    // Restoration Context
    restoration_strategy: z.enum(['fresh', 'restore_state', 'clone']).default('restore_state').describe('How the widget should initialize on reload.'),
});

export type WindowLayoutEntry = z.infer<typeof WindowLayoutEntrySchema>;

/**
 * Layout Snapshot Schema
 * The full JSON file format for a saved workspace.
 */
export const LayoutSnapshotSchema = z.object({
    layout_uid: z.string().uuid(),
    name: z.string(),
    description: z.string().optional(),
    
    version: z.string().default('1.0.0'),
    created_at: z.number(),
    updated_at: z.number(),

    // The list of windows to spawn
    windows: z.array(WindowLayoutEntrySchema),

    // Global Metadata for this layout (e.g. "Focus Mode", "Dev Mode")
    environment_overrides: z.record(z.any()).optional().describe('Global config overrides when this layout is active.'),
});

export type LayoutSnapshot = z.infer<typeof LayoutSnapshotSchema>;
