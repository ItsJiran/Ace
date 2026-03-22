import { z } from 'zod';

// ============================================================================
// WINDOW & OVERLAY SCHEMAS
// Governs the visual Transparent Layer and Dumb Window containers
// ============================================================================

export const GlobalOverlayStateSchema = z.object({
    /** 
     * ambient: Click-through mode, completely transparent overlay.
     * interactive: Solid/Focus mode, stealing mouse focus from OS.
     */
    mode: z.enum(['ambient', 'interactive']),
    /** The currently selected window that should be rendered above others */
    focused_window_uid: z.string().nullable(),
    /** Global mouse tracker, updated rarely to prevent spam unless dragging */
    mouse_x: z.number(),
    mouse_y: z.number(),
    /** Developer flag to show the physical bounds of the Transparent Layer */
    debug_bg: z.boolean()
});

export type GlobalOverlayState = z.infer<typeof GlobalOverlayStateSchema>;

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

    is_focused: z.boolean(),
    is_minimized: z.boolean(),

    title: z.string().optional()
});

export type WindowConfig = z.infer<typeof WindowConfigSchema>;
