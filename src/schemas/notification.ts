import { z } from 'zod';

/** Fixed global RAM key for all notifications. */
export const NOTIFICATION_MEMORY_UID = 'system:notifications';
export const MAX_NOTIFICATIONS = 120;

export const NotificationLevelSchema = z.enum([
    'info',
    'success',
    'warning',
    'error',
    'system',
]);

export const NotificationTargetTypeSchema = z.enum([
    'global',
    'window',
    'widget',
    'component',
    'process',
    'gateway',
    'tool',
]);

export const NotificationTargetSchema = z.object({
    type: NotificationTargetTypeSchema.default('global'),
    uid: z.string().optional().describe('Optional UID for specific target instance.'),
    scope: z.string().optional().describe('Optional domain/package scope for filtering.'),
});

export const NotificationSchema = z.object({
    uid: z.string(),
    title: z.string().min(1).max(140),
    message: z.string().min(1).max(2000),
    level: NotificationLevelSchema.default('info'),
    target: NotificationTargetSchema.default({ type: 'global' }),
    payload: z.record(z.string(), z.any()).default({}),
    source: z.object({
        package: z.string().optional(),
        widget_uid: z.string().optional(),
        window_uid: z.string().optional(),
        process_uid: z.string().optional(),
        action: z.string().optional(),
        sub_action: z.string().optional(),
    }).default({}),
    is_read: z.boolean().default(false),
    created_at: z.number(),
    expire_at: z.number().optional().describe('Unix ms timestamp when this notification is no longer relevant.'),
});

export const NotificationArraySchema = z.array(NotificationSchema);

export const NotificationCreateInputSchema = z.object({
    title: z.string().min(1).max(140),
    message: z.string().min(1).max(2000),
    level: NotificationLevelSchema.optional(),
    target: NotificationTargetSchema.optional(),
    payload: z.record(z.string(), z.any()).optional(),
    source: NotificationSchema.shape.source.optional(),
    ttl_ms: z.number().positive().max(7 * 24 * 60 * 60 * 1000).optional(),
});

export type NotificationLevel = z.infer<typeof NotificationLevelSchema>;
export type NotificationTargetType = z.infer<typeof NotificationTargetTypeSchema>;
export type NotificationTarget = z.infer<typeof NotificationTargetSchema>;
export type Notification = z.infer<typeof NotificationSchema>;
export type NotificationCreateInput = z.infer<typeof NotificationCreateInputSchema>;
