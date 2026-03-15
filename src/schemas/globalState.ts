import { z } from 'zod';
import { ConfigItemSchema } from './config';
import { KeybindSchema } from './keybinds';

export const GlobalCursorStateSchema = z.object({
    x: z.number(),
    y: z.number(),
    is_pointer_down: z.boolean(),
    is_inside_app: z.boolean(),
    last_updated_at: z.number(),
});

export const GlobalFocusStateSchema = z.object({
    overlay_mode: z.enum(['ambient', 'interactive']),
    focused_window_uid: z.string().nullable(),
    focused_widget_uid: z.string().nullable(),
    active_element_tag: z.string().nullable(),
    active_element_role: z.string().nullable(),
    mouse_focus_enabled: z.boolean(),
});

export const GlobalRuntimeStateSchema = z.object({
    active_config_items: z.array(ConfigItemSchema),
    active_keybinds: z.array(KeybindSchema),
    running_keybind_uids: z.array(z.string()),
    last_triggered_keybind_uid: z.string().nullable(),
    updated_at: z.number(),
});

export const GlobalStateSchema = z.object({
    cursor: GlobalCursorStateSchema,
    focus: GlobalFocusStateSchema,
    runtime: GlobalRuntimeStateSchema,
});

export type GlobalCursorState = z.infer<typeof GlobalCursorStateSchema>;
export type GlobalFocusState = z.infer<typeof GlobalFocusStateSchema>;
export type GlobalRuntimeState = z.infer<typeof GlobalRuntimeStateSchema>;
export type GlobalState = z.infer<typeof GlobalStateSchema>;
