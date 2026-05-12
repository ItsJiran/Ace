import { z } from 'zod';

// ============================================================================
// WINDOW SCHEMAS
// Governs the visual Transparent Layer and Dumb Window containers
// ============================================================================

export const WindowConfigSchema = z.object({
    /** The unique identifier for this window instance */
    window_uid: z.string(),
    window_style: z.enum(['standard', 'borderless']).optional().default('standard'),

    /** The name of the registered React component to render inside this window */
    title: z.string().optional(),
    component: z.string(),

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
    is_minimized: z.boolean(),
});


export interface SpawnWindowOptions {
    package?: string;
    window?: string;
    window_style?: 'standard' | 'borderless';

    title?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    opacity?: number;
    is_locked?: boolean;
    always_on_top?: boolean;
    z_index?: number;

    __skip_process_tracking?: boolean;
    __process_uid?: string;
    __parent_process_uid?: string;
}

    // package?: string;
    // window?: string;
    // window_style?: 'standard' | 'borderless';

    // title?: string;
    // x?: number;
    // y?: number;
    // width?: number;
    // height?: number;
    // opacity?: number;
    // is_locked?: boolean;
    // always_on_top?: boolean;
    // z_index?: number;

    // __skip_process_tracking?: boolean;
    // __process_uid?: string;
    // __parent_process_uid?: string;

export type WindowConfig = z.infer<typeof WindowConfigSchema>;
