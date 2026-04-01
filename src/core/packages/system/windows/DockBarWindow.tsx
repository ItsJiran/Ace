import { useState, useRef, useEffect, useCallback } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { WindowConfig } from '#/schemas/window';
import type { RegistryPackage } from '#/schemas/registry';
import { AceWindow } from '#/components/layout/AceWindow';
import type { UseAceWindowResult } from '#/hooks/useAceWindow';
import { useAceMemory, useAceMemorySelector } from '#/hooks/useAceMemory';
import { WindowEngine } from '#/services/windowEngine';
import { KernelEngine } from '#/services/kernelEngine';
import {
    Settings2, LayoutDashboard, Terminal, MessageSquare, Cpu, Layers,
    Package, Activity, Code2, Globe, Zap, Bot, Monitor, Search, FileText,
    Home, Star, Calendar, Music, Folder, Inbox, PanelBottom, Sparkles,
    StickyNote, BookOpen, Palette, BrainCircuit,
    AlignJustify, PanelLeft, Circle, Check, AlignLeft, AlignCenter, AlignRight,
} from 'lucide-react';

export const registry: AceRegistryType.Window = {
    name: 'DockBar',
    slug: 'dock-bar-window',
    icon_slug: 'panel-bottom',
    react_behavior: 'window_shell',
    default_config: {
        width: 360,
        height: 180,
        x: 800,
        y: 940,
        chrome_style: 'borderless',
        drag_surface: 'full',
        hide_ring: true,
        always_on_top: true,
    },
};

// ─── Types ────────────────────────────────────────────────────────────────────

type DockMode = 'horizontal' | 'vertical' | 'pill';
type PillDirection = 'left' | 'center' | 'right';

const DOCK_MODE_KEY     = 'system:dock_bar:mode';
const DOCK_PILL_DIR_KEY = 'system:dock_bar:pill_direction';

/** Extra height/width beyond the visible bar gives room for the context menu. */
const MODE_BOUNDS: Record<DockMode, { width: number; height: number }> = {
    horizontal: { width: 360, height: 180 },
    vertical:   { width: 180, height: 360 },
    pill:       { width: 360, height: 180 },
};

// ─── Icon map (lucide icon_slug → component) ──────────────────────────────────

type IconComponent = React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;

const ICON_MAP: Record<string, IconComponent> = {
    'settings-2':       Settings2,
    'layout-dashboard': LayoutDashboard,
    'terminal':         Terminal,
    'message-square':   MessageSquare,
    'cpu':              Cpu,
    'layers':           Layers,
    'package':          Package,
    'activity':         Activity,
    'code-2':           Code2,
    'globe':            Globe,
    'zap':              Zap,
    'bot':              Bot,
    'monitor':          Monitor,
    'search':           Search,
    'file-text':        FileText,
    'home':             Home,
    'star':             Star,
    'calendar':         Calendar,
    'music':            Music,
    'folder':           Folder,
    'inbox':            Inbox,
    'panel-bottom':     PanelBottom,
    'sparkles':         Sparkles,
    'sticky-note':      StickyNote,
    'book-open':        BookOpen,
    'palette':          Palette,
    'brain-circuit':    BrainCircuit,
};

function resolveWindowIcon(
    pkgs: RegistryPackage[] | null | undefined,
    componentRef: string,
): IconComponent | null {
    if (!pkgs) return null;
    // componentRef is a full entry ref: '<packageName>:<domain>:<slug>'
    // e.g. 'itsjiran/ace-system-dev:windows:dev-kit'
    const firstColon = componentRef.indexOf(':');
    const lastColon  = componentRef.lastIndexOf(':');
    const packageName = firstColon !== -1 ? componentRef.substring(0, firstColon) : null;
    const windowSlug  = lastColon  !== -1 ? componentRef.substring(lastColon + 1) : componentRef;

    for (const pkg of pkgs) {
        if (packageName && pkg.manifest.package_name !== packageName) continue;
        const win = (pkg.domains?.windows as Record<string, any> | undefined)?.[windowSlug];
        if (win) {
            const iconSlug = win.metadata?.icon_slug as string | undefined;
            if (iconSlug && ICON_MAP[iconSlug]) return ICON_MAP[iconSlug];
        }
    }
    return null;
}

// ─── Shared surface & design tokens ──────────────────────────────────────────

const SURFACE: React.CSSProperties = {
    background: 'rgba(255, 255, 255, 0.94)',
    backdropFilter: 'blur(24px) saturate(160%)',
    WebkitBackdropFilter: 'blur(24px) saturate(160%)',
    border: '1px solid rgba(227, 231, 240, 0.95)',
    boxShadow: '0 6px 24px rgba(25, 35, 58, 0.08), 0 1px 6px rgba(25, 35, 58, 0.05)',
};

const FONT = '"Manrope","Plus Jakarta Sans","Inter",sans-serif';

// ─── Accent palette (light, per window) ──────────────────────────────────────

const ACCENT = [
    { bg: '#EEF2FF', border: '#C7D2FE', fg: '#2952E3', dot: '#4B72FF' },
    { bg: '#F5F3FF', border: '#DDD6FE', fg: '#6D28D9', dot: '#8B5CF6' },
    { bg: '#ECFDF5', border: '#A7F3D0', fg: '#047857', dot: '#10B981' },
    { bg: '#FFF7ED', border: '#FED7AA', fg: '#B45309', dot: '#F59E0B' },
    { bg: '#FFF1F2', border: '#FECDD3', fg: '#BE123C', dot: '#F43F5E' },
    { bg: '#F0F9FF', border: '#BAE6FD', fg: '#0369A1', dot: '#38BDF8' },
];

function uidToAccent(uid: string) {
    let h = 0;
    for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
    return ACCENT[h % ACCENT.length];
}

// ─── Context menu ─────────────────────────────────────────────────────────────

const MODE_CTX: Array<{ id: DockMode; label: string; icon: React.ReactNode }> = [
    { id: 'horizontal', label: 'Horizontal bar',   icon: <AlignJustify size={12} strokeWidth={2} /> },
    { id: 'vertical',   label: 'Vertical sidebar', icon: <PanelLeft size={12} strokeWidth={2} /> },
    { id: 'pill',       label: 'Compact pill',     icon: <Circle size={12} strokeWidth={2} /> },
];

const PILL_DIR_CTX: Array<{ id: PillDirection; label: string; icon: React.ReactNode }> = [
    { id: 'left',   label: 'Expand right', icon: <AlignLeft   size={11} strokeWidth={2} /> },
    { id: 'center', label: 'Expand both',  icon: <AlignCenter size={11} strokeWidth={2} /> },
    { id: 'right',  label: 'Expand left',  icon: <AlignRight  size={11} strokeWidth={2} /> },
];

function CtxRow({ active, icon, label, onClick }: {
    active?: boolean;
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            data-window-action="true"
            style={{
                display: 'flex', alignItems: 'center', gap: 7,
                width: '100%', padding: '5px 10px',
                background: active ? '#EEF2FF' : 'transparent',
                color: active ? '#2952E3' : '#3D4458',
                border: 'none', cursor: 'pointer',
                fontSize: 11.5, fontFamily: FONT, fontWeight: active ? 600 : 500,
                textAlign: 'left',
            }}
        >
            <span style={{ color: active ? '#2952E3' : '#9EA7BE', display: 'flex' }}>{icon}</span>
            <span style={{ flex: 1 }}>{label}</span>
            {active && <Check size={10} strokeWidth={2.5} color="#2952E3" />}
        </button>
    );
}

function CtxSectionLabel({ label }: { label: string }) {
    return (
        <p style={{
            fontSize: 9, color: '#B0BAD0', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: 0.9,
            padding: '6px 10px 2px', margin: 0, fontFamily: FONT,
        }}>{label}</p>
    );
}

function DockContextMenu({ x, y, mode, pillDir, onMode, onPillDir, onClose }: {
    x: number;
    y: number;
    mode: DockMode;
    pillDir: PillDirection;
    onMode: (m: DockMode) => void;
    onPillDir: (d: PillDirection) => void;
    onClose: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const fn = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) onClose();
        };
        document.addEventListener('mousedown', fn, true);
        return () => document.removeEventListener('mousedown', fn, true);
    }, [onClose]);

    return (
        <div
            ref={ref}
            data-window-action="true"
            data-dock-context-menu="true"
            style={{
                position: 'absolute', left: x, top: y, zIndex: 99999,
                width: 168, pointerEvents: 'auto',
                background: '#FFFFFF',
                border: '1px solid #E3E7F0',
                borderRadius: 12,
                boxShadow: '0 8px 24px rgba(25,35,58,0.13), 0 2px 6px rgba(25,35,58,0.07)',
                overflow: 'hidden',
                fontFamily: FONT,
            }}
        >
            <CtxSectionLabel label="Layout" />
            {MODE_CTX.map(m => (
                <CtxRow
                    key={m.id}
                    active={mode === m.id}
                    icon={m.icon}
                    label={m.label}
                    onClick={() => { onMode(m.id); if (m.id !== 'pill') onClose(); }}
                />
            ))}

            {/* Pill sub-options: expand direction */}
            {mode === 'pill' && (
                <>
                    <div style={{ height: 1, background: '#F0F2F7', margin: '4px 0' }} />
                    <CtxSectionLabel label="Pill expands" />
                    {PILL_DIR_CTX.map(d => (
                        <CtxRow
                            key={d.id}
                            active={pillDir === d.id}
                            icon={d.icon}
                            label={d.label}
                            onClick={() => { onPillDir(d.id); onClose(); }}
                        />
                    ))}
                </>
            )}
            <div style={{ height: 4 }} />
        </div>
    );
}

// ─── DockEntry ────────────────────────────────────────────────────────────────
//
// The state dot lives inside the icon button box: a small pip anchored to
// the bottom-right corner. This keeps the per-entry layout free of any
// external decorators — just a single rectangular block.

function DockEntry({ uid, selfUid, pkgs, compact, vertical, onContextMenu }: {
    uid: string;
    selfUid: string;
    pkgs: RegistryPackage[] | null | undefined;
    compact?: boolean;
    vertical?: boolean;
    onContextMenu?: (e: React.MouseEvent) => void;
}) {
    // Selector: subscribe only to the three fields DockEntry renders.
    // This prevents a re-render on every focus event (which bumps z_index only).
    type DockEntrySnapshot = { is_minimized: boolean; title: string; component: string } | undefined;
    const config = useAceMemorySelector<WindowConfig, DockEntrySnapshot>(
        `system:window:${uid}`,
        (win) => win ? { is_minimized: win.is_minimized, title: win.title || '', component: win.component } : undefined,
        (a, b) => {
            if (a === b) return true;
            if (!a || !b) return a === b;
            return a.is_minimized === b.is_minimized && a.title === b.title && a.component === b.component;
        }
    );
    const [hov, setHov] = useState(false);

    // Hooks must run before early return
    const IconComp = config ? resolveWindowIcon(pkgs, config.component) : null;

    if (!config || uid === selfUid) return null;

    const isMin   = config.is_minimized;
    const title   = config.title || config.component || uid;
    const letter  = title.replace(/^[^A-Za-z0-9]*/, '').charAt(0).toUpperCase() || '?';
    const a       = uidToAccent(uid);
    const btnSize = compact ? 26 : 30;
    const radius  = compact ? 8 : 10;
    // Dot size & inset relative to button size
    const dotSize = compact ? 4 : 5;
    const dotInset = 2;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isMin) WindowEngine.restoreWindow(uid);
        else WindowEngine.focusWindow(uid);
    };

    // Tooltip: above for horizontal, to the right for vertical
    const tipStyle: React.CSSProperties = vertical ? {
        position: 'absolute',
        left: btnSize + 8,
        top: '50%',
        transform: `translateY(-50%) translateX(${hov ? 0 : -4}px)`,
        opacity: hov ? 1 : 0,
        transition: 'all 130ms ease-out',
        pointerEvents: 'none',
        zIndex: 99999,
        whiteSpace: 'nowrap',
    } : {
        position: 'absolute',
        bottom: btnSize + 8,
        left: '50%',
        transform: `translateX(-50%) translateY(${hov ? 0 : 4}px)`,
        opacity: hov ? 1 : 0,
        transition: 'all 130ms ease-out',
        pointerEvents: 'none',
        zIndex: 99999,
        whiteSpace: 'nowrap',
    };

    return (
        <div
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            onContextMenu={onContextMenu}
            data-window-action="true"
            style={{
                position: 'relative',
                flexShrink: 0,
                // Vertical mode: full-width row so dot stays right-aligned
                ...(vertical ? { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' } : {}),
            }}
        >
            {/* Tooltip */}
            <div style={tipStyle}>
                <div style={{
                    background: '#fff', color: '#171A23',
                    fontSize: 10.5, fontWeight: 600,
                    padding: '3px 9px', borderRadius: 7,
                    border: '1px solid #E3E7F0',
                    boxShadow: '0 3px 12px rgba(25,35,58,0.11)',
                    fontFamily: FONT,
                }}>
                    {title}
                </div>
            </div>

            {/* Icon button — relative so the dot pip can be positioned inside */}
            <button
                onClick={handleClick}
                data-window-action="true"
                style={{
                    position: 'relative',
                    width: btnSize, height: btnSize, borderRadius: radius,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: compact ? 10 : 11, fontWeight: 700,
                    cursor: 'pointer', userSelect: 'none', flexShrink: 0,
                    background: isMin ? '#F3F4F8' : a.bg,
                    color: isMin ? '#C0CADD' : a.fg,
                    border: `1.5px solid ${isMin ? '#E8ECF5' : a.border}`,
                    opacity: isMin ? 0.5 : 1,
                    transform: hov
                        ? isMin ? 'scale(0.97)'
                            : vertical ? 'scale(1.08) translateX(1px)'
                            : 'scale(1.10) translateY(-1px)'
                        : isMin ? 'scale(0.9)' : 'scale(1)',
                    transition: 'all 130ms ease-out',
                    boxShadow: hov && !isMin ? `0 3px 10px ${a.dot}3A` : 'none',
                }}
            >
                {IconComp
                    ? <IconComp size={compact ? 12 : 14} strokeWidth={2} color={isMin ? '#C0CADD' : a.fg} />
                    : letter
                }

                {/* ── State dot — inside button, bottom-right pip ── */}
                <div style={{
                    position: 'absolute',
                    bottom: dotInset, right: dotInset,
                    width: dotSize, height: dotSize,
                    borderRadius: 9999,
                    background: isMin ? '#CBD5E1' : a.dot,
                    // Subtle ring so the dot reads clearly on the colored bg
                    boxShadow: isMin
                        ? 'none'
                        : `0 0 0 1.5px ${a.bg}, 0 0 5px ${a.dot}60`,
                    opacity: isMin ? 0.4 : 1,
                    transition: 'all 180ms ease-out',
                    pointerEvents: 'none',
                }} />
            </button>
        </div>
    );
}

// ─── Transparent outer wrapper (shared) ──────────────────────────────────────
// Wraps each mode so only the visible bar surface captures pointer events.
// The rest of the OS window area is click-through, which allows the context
// menu to render above the bar without needing the window to be resized.

function BarWrapper({ vertical, children }: { vertical?: boolean; children: React.ReactNode }) {
    return (
        <div style={{
            width: '100%', height: '100%',
            display: 'flex',
            flexDirection: vertical ? 'row' : 'column',
            alignItems: vertical ? 'flex-start' : 'center',
            justifyContent: vertical ? 'center' : 'flex-end',
            pointerEvents: 'none',
            ...(vertical ? { paddingLeft: 14 } : { paddingBottom: 14 }),
        }}>
            {children}
        </div>
    );
}

// ─── HORIZONTAL MODE ──────────────────────────────────────────────────────────

function HorizontalBar({ windowUid, pkgs, onDragStart, onContextMenu, isDragging }: {
    windowUid: string;
    pkgs: RegistryPackage[] | null | undefined;
    onDragStart: (e: React.MouseEvent<HTMLElement>) => void;
    onContextMenu: (e: React.MouseEvent) => void;
    isDragging: boolean;
}) {
    const aws = useAceMemory<Array<{ uid: string; component: string }>>('system:rendered_windows') ?? [];
    const entries = aws.filter(w => w.uid !== windowUid);

    return (
        <BarWrapper>
            <div
                onMouseDown={onDragStart}
                onContextMenu={onContextMenu}
                data-window-action="true"
                data-overlay-surface="true"
                style={{
                    ...SURFACE,
                    height: 50,
                    display: 'flex', alignItems: 'center',
                    gap: 5, paddingLeft: 10, paddingRight: 10,
                    borderRadius: 16,
                    cursor: isDragging ? 'grabbing' : 'grab',
                    userSelect: 'none',
                    pointerEvents: 'auto',
                    minWidth: 60,
                }}
            >
                {entries.length === 0
                    ? <EmptyLabel />
                    : entries.map(w => (
                        <DockEntry key={w.uid} uid={w.uid} selfUid={windowUid} pkgs={pkgs} onContextMenu={onContextMenu} />
                    ))
                }
            </div>
        </BarWrapper>
    );
}

// ─── VERTICAL MODE ────────────────────────────────────────────────────────────

function VerticalBar({ windowUid, pkgs, onDragStart, onContextMenu, isDragging }: {
    windowUid: string;
    pkgs: RegistryPackage[] | null | undefined;
    onDragStart: (e: React.MouseEvent<HTMLElement>) => void;
    onContextMenu: (e: React.MouseEvent) => void;
    isDragging: boolean;
}) {
    const aws = useAceMemory<Array<{ uid: string; component: string }>>('system:rendered_windows') ?? [];
    const entries = aws.filter(w => w.uid !== windowUid);

    return (
        <BarWrapper vertical>
            <div
                onMouseDown={onDragStart}
                onContextMenu={onContextMenu}
                data-window-action="true"
                data-overlay-surface="true"
                style={{
                    ...SURFACE,
                    width: 50,
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 5, paddingTop: 10, paddingBottom: 10,
                    borderRadius: 16,
                    cursor: isDragging ? 'grabbing' : 'grab',
                    userSelect: 'none',
                    pointerEvents: 'auto',
                    minHeight: 60,
                }}
            >
                {entries.length === 0
                    ? <EmptyLabel vertical />
                    : entries.map(w => (
                        <DockEntry key={w.uid} uid={w.uid} selfUid={windowUid} pkgs={pkgs} vertical onContextMenu={onContextMenu} />
                    ))
                }
            </div>
        </BarWrapper>
    );
}

// ─── PILL MODE ────────────────────────────────────────────────────────────────
//
// The pill can anchor from three positions:
//   left   — collapsed circle stays left; entry list grows rightward
//   right  — collapsed circle stays right; entry list grows leftward
//   center — collapsed circle stays centered; list grows both directions
//
// BarWrapper handles the OS-window full-size transparent host.
// `pillDir` decides justification.

function PillBar({ windowUid, pkgs, pillDir, onDragStart, onContextMenu, isDragging }: {
    windowUid: string;
    pkgs: RegistryPackage[] | null | undefined;
    pillDir: PillDirection;
    onDragStart: (e: React.MouseEvent<HTMLElement>) => void;
    onContextMenu: (e: React.MouseEvent) => void;
    isDragging: boolean;
}) {
    const aws = useAceMemory<Array<{ uid: string; component: string }>>('system:rendered_windows') ?? [];
    const entries = aws.filter(w => w.uid !== windowUid);
    const [expanded, setExpanded] = useState(false);
    const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current); }, []);

    const onEnter = () => { if (leaveTimer.current) clearTimeout(leaveTimer.current); setExpanded(true); };
    const onLeave = () => { leaveTimer.current = setTimeout(() => setExpanded(false), 160); };

    const PER_ENTRY = 31;
    const expandedW = entries.length > 0
        ? Math.max(80, Math.min(entries.length * PER_ENTRY + 20, 334))
        : 90;
    const pillW = expanded ? expandedW : 44;
    const previewDots = entries.slice(0, 6).map(w => uidToAccent(w.uid).dot);

    // BarWrapper justify: left → start, right → end, center → center
    const justifyWrapper = pillDir === 'left' ? 'flex-start' : pillDir === 'right' ? 'flex-end' : 'center';

    return (
        // Transparent full-size host
        <div style={{
            width: '100%', height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: justifyWrapper,
            justifyContent: 'flex-end',
            pointerEvents: 'none',
            paddingBottom: 14,
        }}>
            <div
                onMouseEnter={onEnter}
                onMouseLeave={onLeave}
                onMouseDown={onDragStart}
                onContextMenu={onContextMenu}
                data-window-action="true"
                data-overlay-surface="true"
                style={{
                    ...SURFACE,
                    pointerEvents: 'auto',
                    borderRadius: 9999,
                    height: 44,
                    width: pillW,
                    transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                    cursor: isDragging ? 'grabbing' : expanded ? 'grab' : 'pointer',
                    userSelect: 'none',
                    position: 'relative',
                }}
            >
                {/* Collapsed: accent dot preview */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    position: 'absolute',
                    transition: 'opacity 140ms ease-out',
                    opacity: expanded ? 0 : 1,
                    pointerEvents: expanded ? 'none' : 'auto',
                }}>
                    {previewDots.length === 0 ? (
                        <div style={{ width: 7, height: 7, borderRadius: 9999, background: '#D8DEE9' }} />
                    ) : (
                        previewDots.map((dot, i) => (
                            <div key={i} style={{
                                width: 6, height: 6, borderRadius: 9999,
                                background: dot, boxShadow: `0 0 4px ${dot}55`,
                            }} />
                        ))
                    )}
                    {entries.length > 6 && (
                        <span style={{ fontSize: 9, color: '#9EA7BE', fontWeight: 700, fontFamily: FONT }}>
                            +{entries.length - 6}
                        </span>
                    )}
                </div>

                {/* Expanded: scrollable icons */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    paddingLeft: 9, paddingRight: 9,
                    height: '100%', width: '100%',
                    overflowX: 'auto', overflowY: 'visible',
                    scrollbarWidth: 'none',
                    transition: 'opacity 140ms ease-out',
                    opacity: expanded ? 1 : 0,
                    pointerEvents: expanded ? 'auto' : 'none',
                    flexShrink: 0,
                    // Content alignment mirrors expand direction so new items
                    // appear from the anchor side
                    justifyContent: pillDir === 'right' ? 'flex-end' : 'flex-start',
                }}>
                    {entries.length === 0
                        ? <span style={{ color: '#B0BAD0', fontSize: 10.5, whiteSpace: 'nowrap', fontFamily: FONT }}>No windows</span>
                        : entries.map(w => (
                            <DockEntry key={w.uid} uid={w.uid} selfUid={windowUid} pkgs={pkgs} compact onContextMenu={onContextMenu} />
                        ))
                    }
                </div>
            </div>
        </div>
    );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyLabel({ vertical }: { vertical?: boolean }) {
    return (
        <span style={{
            color: '#C0CADD', fontSize: 10.5, fontFamily: FONT, fontWeight: 500,
            flex: 1, textAlign: 'center', alignSelf: 'center', whiteSpace: 'nowrap',
            ...(vertical ? { writingMode: 'vertical-lr' as const, letterSpacing: 0.3 } : {}),
        }}>
            No windows
        </span>
    );
}

// ─── DockBarInner ─────────────────────────────────────────────────────────────

function DockBarInner({ w, windowUid }: { w: UseAceWindowResult; windowUid: string }) {
    const savedMode    = useAceMemory<DockMode>(DOCK_MODE_KEY);
    const savedPillDir = useAceMemory<PillDirection>(DOCK_PILL_DIR_KEY);
    const pkgs         = useAceMemory<RegistryPackage[]>('system:package_registry');
    const mode: DockMode         = savedMode    ?? 'pill';
    const pillDir: PillDirection = savedPillDir ?? 'center';
    const viewportRef  = useRef<HTMLDivElement>(null);
    const positioned   = useRef(false);

    // ── Auto-center on first config load ─────────────────────────────────────
    useEffect(() => {
        if (positioned.current || !w.config) return;
        positioned.current = true;
        const { width, height } = MODE_BOUNDS[mode];
        const sw = window.innerWidth, sh = window.innerHeight;
        const nx = mode === 'vertical' ? 12 : Math.round(sw / 2 - width / 2);
        const ny = mode === 'vertical' ? Math.round(sh / 2 - height / 2) : Math.round(sh - height - 20);
        if (nx !== w.config.x || ny !== w.config.y)
            w.updateBounds(nx, ny, width, height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [w.config]);

    // ── Mode change ───────────────────────────────────────────────────────────
    const handleModeChange = useCallback((next: DockMode) => {
        KernelEngine.writeMemory(DOCK_MODE_KEY, next);
        const { width, height } = MODE_BOUNDS[next];
        const sw = window.innerWidth, sh = window.innerHeight;
        const nx = next === 'vertical' ? 12 : Math.round(sw / 2 - width / 2);
        const ny = next === 'vertical' ? Math.round(sh / 2 - height / 2) : Math.round(sh - height - 20);
        w.updateBounds(nx, ny, width, height);
    }, [w]);

    // ── Pill direction change ─────────────────────────────────────────────────
    const handlePillDirChange = useCallback((next: PillDirection) => {
        KernelEngine.writeMemory(DOCK_PILL_DIR_KEY, next);
    }, []);

    // ── Context menu ──────────────────────────────────────────────────────────
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

    // Strong dismissal behavior:
    // - close on any pointer down outside menu
    // - close when app window loses focus (desktop click pass-through case)
    useEffect(() => {
        if (!ctxMenu) return;

        const handlePointerDown = (e: PointerEvent) => {
            const target = e.target as HTMLElement | null;
            if (target?.closest('[data-dock-context-menu="true"]')) return;
            setCtxMenu(null);
        };

        const handleBlur = () => setCtxMenu(null);
        const handleVisibility = () => {
            if (document.visibilityState !== 'visible') setCtxMenu(null);
        };

        document.addEventListener('pointerdown', handlePointerDown, true);
        window.addEventListener('blur', handleBlur);
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown, true);
            window.removeEventListener('blur', handleBlur);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [ctxMenu]);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!viewportRef.current) return;
        const rect = viewportRef.current.getBoundingClientRect();
        const rx = e.clientX - rect.left;
        const ry = e.clientY - rect.top;
        const menuH = mode === 'pill' ? 162 : 110;
        const mx = Math.max(4, Math.min(rx - 84, rect.width - 172));
        const my = Math.max(4, Math.min(ry - menuH, rect.height - menuH - 4));
        setCtxMenu({ x: mx, y: my });
    }, [mode]);

    const shared = {
        windowUid, pkgs,
        onDragStart: w.dragHandleProps.onMouseDown,
        onContextMenu: handleContextMenu,
        isDragging: w.isDragging,
    };

    return (
        <div
            {...w.rootProps}
            ref={w.ref}
            className="absolute top-0 left-0 pointer-events-auto"
            style={{ ...w.rootStyle, transitionDuration: '0ms' }}
        >
            <div ref={viewportRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
                {mode === 'horizontal' && <HorizontalBar {...shared} />}
                {mode === 'vertical'   && <VerticalBar   {...shared} />}
                {mode === 'pill'       && <PillBar        {...shared} pillDir={pillDir} />}

                {ctxMenu && (
                    <DockContextMenu
                        x={ctxMenu.x}
                        y={ctxMenu.y}
                        mode={mode}
                        pillDir={pillDir}
                        onMode={handleModeChange}
                        onPillDir={handlePillDirChange}
                        onClose={() => setCtxMenu(null)}
                    />
                )}
            </div>
        </div>
    );
}

// ─── DockBarWindow ────────────────────────────────────────────────────────────

export default function DockBarWindow({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid} headless>
            {(w) => {
                if (!w.config) return null;
                return <DockBarInner w={w} windowUid={windowUid} />;
            }}
        </AceWindow>
    );
}

