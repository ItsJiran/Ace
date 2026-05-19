import { z } from 'zod';

export const WindowDisplayModeSchema = z.enum([
    'all_visible',
    'active_and_focused_only',
    'all_semi_transparent',
    'all_transparent',
]);

export const CursorStateSchema = z.object({
    x: z.number(),
    y: z.number(),
    is_pointer_down: z.boolean(),
    is_inside_app: z.boolean(),
    last_updated_at: z.number(),
});

export const DesktopStateSchema = z.object({
    mode: z.enum(['ambient', 'interactive']),
    /**
     * Controls how every window shell should present itself visually at the desktop level.
     * - `all_visible`: every window resolves to the `active` shell styling.
     * - `active_and_focused_only`: only active/focused/interacting windows resolve to `active`.
     * - `all_semi_transparent`: every window resolves to `semi-transparent`.
     * - `all_transparent`: every window resolves to `transparent`.
     *
     * This is intentionally separate from `mode`, which still controls overlay input behavior.
     */
    window_display_mode: WindowDisplayModeSchema.default('all_visible'),
    mouse_x: z.number(),
    mouse_y: z.number(),
    debug_bg: z.boolean(),
    is_overlay_locked: z.boolean().default(false),
    focused_widget_uid: z.string().nullable(),
    active_element_tag: z.string().nullable(),
    active_element_role: z.string().nullable(),
});

export type CursorState = z.infer<typeof CursorStateSchema>;
export type DesktopState = z.infer<typeof DesktopStateSchema>;
export type WindowDisplayMode = z.infer<typeof WindowDisplayModeSchema>;
