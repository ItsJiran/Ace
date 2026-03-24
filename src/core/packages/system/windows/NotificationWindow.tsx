import { useMemo, useRef, useState, useEffect } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { Notification } from '#/schemas/notification';
import { NOTIFICATION_MEMORY_UID } from '#/schemas/notification';
import { AceWindow } from '#/components/layout/AceWindow';
import { useAceMemory } from '#/hooks/useAceMemory';
import { Bell, CheckCheck, X, Dot } from 'lucide-react';

export const registry: AceRegistryType.Window = {
    name: 'Notification Window',
    slug: 'notification-window',
    icon_slug: 'inbox',
    react_behavior: 'window_shell',
    default_config: {
        width: 340,
        height: 320,
        x: 1520,
        y: 760,
        chrome_style: 'borderless',
        drag_surface: 'full',
        hide_ring: true,
        always_on_top: true,
    },
};

const FONT = '"Manrope","Plus Jakarta Sans","Inter",sans-serif';

function levelColor(level: Notification['level']) {
    if (level === 'success') return '#10B981';
    if (level === 'warning') return '#F59E0B';
    if (level === 'error') return '#EF4444';
    if (level === 'system') return '#6366F1';
    return '#3B82F6';
}

function formatAge(createdAt: number) {
    const ms = Date.now() - createdAt;
    if (ms < 60_000) return 'now';
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
    return `${Math.floor(ms / 86_400_000)}d`;
}

export default function NotificationWindow({ windowUid }: { windowUid: string }) {
    const all = useAceMemory<Notification[]>(NOTIFICATION_MEMORY_UID) ?? [];
    const [expanded, setExpanded] = useState(false);
    const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (leaveTimer.current) clearTimeout(leaveTimer.current);
        };
    }, []);

    const notifications = useMemo(() => {
        const now = Date.now();
        return all
            .filter((item) => !item.expire_at || item.expire_at > now)
            .sort((a, b) => b.created_at - a.created_at);
    }, [all]);

    const unreadCount = notifications.reduce((sum, n) => sum + (n.is_read ? 0 : 1), 0);

    const onEnter = () => {
        if (leaveTimer.current) clearTimeout(leaveTimer.current);
        setExpanded(true);
    };

    const onLeave = () => {
        leaveTimer.current = setTimeout(() => setExpanded(false), 150);
    };

    const clearAll = () => {
        window.ACE.notification?.clear();
    };

    const markRead = (uid: string) => {
        window.ACE.notification?.markRead(uid, true);
    };

    const removeOne = (uid: string) => {
        window.ACE.notification?.remove(uid);
    };

    return (
        <AceWindow windowUid={windowUid} headless>
            {({ dragHandleProps, isDragging }) => (
                <div
                    style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'flex-end',
                        justifyContent: 'flex-end',
                        pointerEvents: 'none',
                        padding: 12,
                        fontFamily: FONT,
                    }}
                >
                    <div
                        onMouseEnter={onEnter}
                        onMouseLeave={onLeave}
                        style={{
                            width: 320,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-end',
                            gap: 8,
                            pointerEvents: 'auto',
                        }}
                    >
                        {/* Overflow list panel */}
                        <div
                            data-window-action="true"
                            data-overlay-surface="true"
                            style={{
                                width: '100%',
                                maxHeight: expanded ? 240 : 0,
                                opacity: expanded ? 1 : 0,
                                transform: expanded ? 'translateY(0)' : 'translateY(8px)',
                                overflow: 'hidden',
                                borderRadius: 16,
                                border: '1px solid #E3E7F0',
                                background: 'rgba(255,255,255,0.96)',
                                backdropFilter: 'blur(18px) saturate(160%)',
                                WebkitBackdropFilter: 'blur(18px) saturate(160%)',
                                boxShadow: '0 14px 36px rgba(25,35,58,0.16), 0 2px 8px rgba(25,35,58,0.10)',
                                transition: 'all 180ms cubic-bezier(0.4,0,0.2,1)',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '10px 12px',
                                    borderBottom: '1px solid #EEF2F7',
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Bell size={14} color="#334155" />
                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1E293B' }}>
                                        Notifications
                                    </span>
                                    <span
                                        style={{
                                            fontSize: 10,
                                            fontWeight: 700,
                                            color: '#2563EB',
                                            background: '#DBEAFE',
                                            borderRadius: 9999,
                                            padding: '2px 6px',
                                        }}
                                    >
                                        {notifications.length}
                                    </span>
                                </div>

                                <button
                                    onClick={clearAll}
                                    style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: '#64748B',
                                        cursor: 'pointer',
                                        fontSize: 11,
                                        fontWeight: 600,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        padding: 0,
                                    }}
                                    title="Clear all"
                                >
                                    <CheckCheck size={12} />
                                    Clear
                                </button>
                            </div>

                            <div
                                data-window-action="true"
                                data-overlay-surface="true"
                                style={{
                                    maxHeight: 190,
                                    overflowY: 'auto',
                                    padding: 8,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 6,
                                }}
                            >
                                {notifications.length === 0 && (
                                    <div
                                        style={{
                                            border: '1px dashed #DCE3F1',
                                            borderRadius: 12,
                                            padding: '14px 10px',
                                            textAlign: 'center',
                                            fontSize: 11,
                                            color: '#94A3B8',
                                        }}
                                    >
                                        No notifications yet
                                    </div>
                                )}

                                {notifications.map((item) => {
                                    const accent = levelColor(item.level);
                                    return (
                                        <div
                                            key={item.uid}
                                            onClick={() => markRead(item.uid)}
                                            style={{
                                                border: `1px solid ${item.is_read ? '#E6ECF7' : '#D8E5FF'}`,
                                                background: item.is_read ? '#F8FAFC' : '#EFF6FF',
                                                borderRadius: 12,
                                                padding: '8px 10px',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                                <Dot size={20} color={accent} style={{ marginLeft: -5, marginTop: -1, flexShrink: 0 }} />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div
                                                        style={{
                                                            fontSize: 11.5,
                                                            fontWeight: 700,
                                                            color: '#0F172A',
                                                            lineHeight: 1.25,
                                                            marginBottom: 3,
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        {item.title}
                                                    </div>
                                                    <div
                                                        style={{
                                                            fontSize: 10.5,
                                                            color: '#334155',
                                                            lineHeight: 1.35,
                                                            marginBottom: 4,
                                                            display: '-webkit-box',
                                                            WebkitLineClamp: 2,
                                                            WebkitBoxOrient: 'vertical',
                                                            overflow: 'hidden',
                                                        }}
                                                    >
                                                        {item.message}
                                                    </div>
                                                    <div style={{ fontSize: 9.5, color: '#64748B', fontWeight: 600 }}>
                                                        {item.target?.type ?? 'global'} • {formatAge(item.created_at)}
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        removeOne(item.uid);
                                                    }}
                                                    style={{
                                                        border: 'none',
                                                        background: 'transparent',
                                                        color: '#94A3B8',
                                                        cursor: 'pointer',
                                                        padding: 0,
                                                        marginTop: 1,
                                                    }}
                                                    title="Dismiss"
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Pill trigger */}
                        <div
                            data-window-action="true"
                            onMouseDown={dragHandleProps.onMouseDown}
                            style={{
                                height: 44,
                                minWidth: expanded ? 116 : 48,
                                borderRadius: 9999,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: expanded ? 8 : 0,
                                padding: expanded ? '0 12px' : 0,
                                border: '1px solid #DDE4F1',
                                background: 'rgba(255,255,255,0.95)',
                                backdropFilter: 'blur(20px) saturate(170%)',
                                WebkitBackdropFilter: 'blur(20px) saturate(170%)',
                                boxShadow: isDragging
                                    ? '0 10px 24px rgba(37,99,235,0.16)'
                                    : '0 8px 24px rgba(25,35,58,0.10), 0 2px 8px rgba(25,35,58,0.08)',
                                transition: 'all 180ms cubic-bezier(0.4,0,0.2,1)',
                                cursor: isDragging ? 'grabbing' : 'grab',
                                userSelect: 'none',
                            }}
                        >
                            <div style={{ position: 'relative', width: 20, height: 20, display: 'grid', placeItems: 'center' }}>
                                <Bell size={16} color="#334155" />
                                {unreadCount > 0 && (
                                    <span
                                        style={{
                                            position: 'absolute',
                                            right: -4,
                                            top: -4,
                                            minWidth: 14,
                                            height: 14,
                                            borderRadius: 9999,
                                            background: '#EF4444',
                                            color: '#FFFFFF',
                                            fontSize: 9,
                                            fontWeight: 700,
                                            display: 'grid',
                                            placeItems: 'center',
                                            padding: '0 3px',
                                            lineHeight: 1,
                                            border: '1px solid #fff',
                                        }}
                                    >
                                        {unreadCount > 9 ? '9+' : unreadCount}
                                    </span>
                                )}
                            </div>

                            {expanded && (
                                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1E293B', whiteSpace: 'nowrap' }}>
                                    {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </AceWindow>
    );
}
