import type { AceRegistryType } from '#/schemas/registryTypes';
import {
    NOTIFICATION_MEMORY_UID,
    MAX_NOTIFICATIONS,
    NotificationArraySchema,
    NotificationCreateInputSchema,
    type Notification,
    type NotificationCreateInput,
} from '#/schemas/notification';
import { KernelEngine } from '#/services/kernelEngine';

export const registry: AceRegistryType.Widget = {
    name: 'Notification Center',
    slug: 'notification-widget',
    description: 'Global notification bus stored in RAM with structured target/payload contract.',
    autostart: true,
    environment: ['prod', 'dev'],
};

interface NotificationAPI {
    push: (input: NotificationCreateInput) => Notification;
    remove: (uid: string) => boolean;
    markRead: (uid: string, value?: boolean) => boolean;
    clear: () => void;
    list: () => Notification[];
    memory_uid: string;
}

function safeReadNotifications(): Notification[] {
    const current = KernelEngine.readMemory(NOTIFICATION_MEMORY_UID);
    const parsed = NotificationArraySchema.safeParse(current);
    return parsed.success ? parsed.data : [];
}

function persistNotifications(next: Notification[]) {
    KernelEngine.writeMemory(NOTIFICATION_MEMORY_UID, next);
}

function createNotification(input: NotificationCreateInput): Notification {
    const validated = NotificationCreateInputSchema.parse(input);
    const now = Date.now();

    return {
        uid: `notif-${now}-${Math.random().toString(36).slice(2, 8)}`,
        title: validated.title,
        message: validated.message,
        level: validated.level ?? 'info',
        target: validated.target ?? { type: 'global' },
        payload: validated.payload ?? {},
        source: validated.source ?? {},
        is_read: false,
        created_at: now,
        expire_at: typeof validated.ttl_ms === 'number' ? now + validated.ttl_ms : undefined,
    };
}

export default function activate() {
    // Ensure fixed RAM memory is always available for subscribers.
    const existing = safeReadNotifications();
    persistNotifications(existing);

    const notificationWindowRef = 'itsjiran/ace-system:windows:notification-window';
    const hasNotificationWindow = KernelEngine.getRenderedWindows().some((w) => w.component === notificationWindowRef);

    if (!hasNotificationWindow) {
        const screenW = typeof window !== 'undefined' ? window.innerWidth : 1920;
        const screenH = typeof window !== 'undefined' ? window.innerHeight : 1080;
        const width = 340;
        const height = 320;

        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system',
            window: 'notification-window',
            title: 'Notifications',
            width,
            height,
            x: Math.max(12, screenW - width - 16),
            y: Math.max(12, screenH - height - 24),
            chrome_style: 'borderless',
            drag_surface: 'full',
            hide_ring: true,
            always_on_top: true,
        });
    }

    const api: NotificationAPI = {
        push: (input) => {
            const entry = createNotification(input);
            const current = safeReadNotifications();
            const now = Date.now();

            // Keep newest first, enforce max size, and prune expired records.
            const next = [entry, ...current]
                .filter(item => !item.expire_at || item.expire_at > now)
                .slice(0, MAX_NOTIFICATIONS);

            persistNotifications(next);
            return entry;
        },

        remove: (uid) => {
            const current = safeReadNotifications();
            const next = current.filter(item => item.uid !== uid);
            if (next.length === current.length) return false;
            persistNotifications(next);
            return true;
        },

        markRead: (uid, value = true) => {
            const current = safeReadNotifications();
            let changed = false;
            const next = current.map((item) => {
                if (item.uid !== uid) return item;
                if (item.is_read === value) return item;
                changed = true;
                return { ...item, is_read: value };
            });

            if (!changed) return false;
            persistNotifications(next);
            return true;
        },

        clear: () => {
            persistNotifications([]);
        },

        list: () => {
            const now = Date.now();
            const current = safeReadNotifications();
            return current.filter(item => !item.expire_at || item.expire_at > now);
        },

        memory_uid: NOTIFICATION_MEMORY_UID,
    };

    // Expose notification bus helper for cross-domain usage.
    const runtime = window as Window & { ACE: Window['ACE'] & { notification?: NotificationAPI } };
    runtime.ACE.notification = api;
}
