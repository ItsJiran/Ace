import { z } from 'zod';

// ============================================================================
// WINDOW SCHEMAS
// Governs the visual Transparent Layer and Dumb Window containers
// ============================================================================

export const WindowConfigSchema = z.object({
    window_uid: z.string(),

    /** The name of the registered React component to render inside this window */
    component: z.string(),

    /** The memory_uid of the payload this component should read data from */
    payload_memory_uid: z.string().optional(),

    // Visual bounds
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    z_index: z.number(),

    // Visual State
    opacity: z.number().optional().default(1),
    is_locked: z.boolean().optional().default(false),
    always_on_top: z.boolean().optional().default(false),
    chrome_style: z.enum(['standard', 'borderless']).optional().default('standard'),
    drag_surface: z.enum(['header', 'full']).optional().default('header'),
    hide_ring: z.boolean().optional().default(false),

    is_minimized: z.boolean(),

    title: z.string().optional()
});

export type WindowConfig = z.infer<typeof WindowConfigSchema>;
