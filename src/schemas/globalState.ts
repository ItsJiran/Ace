import { z } from 'zod';
import { ConfigItemSchema } from './config';
import { KeybindSchema } from './keybinds';

export const CursorStateSchema = z.object({
    x: z.number(),
    y: z.number(),
    is_pointer_down: z.boolean(),
    is_inside_app: z.boolean(),
    last_updated_at: z.number(),
});

export const DesktopStateSchema = z.object({
    mode: z.enum(['ambient', 'interactive']),
    mouse_x: z.number(),
    mouse_y: z.number(),
    debug_bg: z.boolean(),
    is_overlay_locked: z.boolean().default(false),
    focused_widget_uid: z.string().nullable(),
    active_element_tag: z.string().nullable(),
    active_element_role: z.string().nullable(),
});

export const RuntimeStateSchema = z.object({
    active_config_items: z.array(ConfigItemSchema),
    active_keybinds: z.array(KeybindSchema),
    running_keybind_uids: z.array(z.string()),
    last_triggered_keybind_uid: z.string().nullable(),
    updated_at: z.number(),
});

export type CursorState = z.infer<typeof CursorStateSchema>;
export type DesktopState = z.infer<typeof DesktopStateSchema>;
export type RuntimeState = z.infer<typeof RuntimeStateSchema>;
