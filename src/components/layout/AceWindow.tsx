import React, { useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { WindowConfig } from '#/schemas/window';
import { useAceWindow, type UseAceWindowResult } from '#/hooks/useAceWindow';
import { useAceMemorySelector } from '#/hooks/useAceMemory';
import { GripHorizontal, X, Minus, Lock, Unlock, BringToFront, Layers } from 'lucide-react';
import { RenderCounterBadge } from '#/components/dev/RenderCounterBadge';

type AceWindowProps = {
    windowUid?: string;
    config?: WindowConfig;
    headless?: boolean;
    className?: string;
    style?: React.CSSProperties;
    children?: ReactNode | ((props: UseAceWindowResult) => ReactNode);
};

// Accept either windowUid (preferred runtime path) or direct config object
function AceWindowComponent({ windowUid, config, headless, className, style, children }: AceWindowProps) {

    // Determine source
    const input = windowUid || config;
    if (!input) return null;

    const window = useAceWindow(input);
    const resolvedConfig = window.config || config;
    
    // Safety check: if config isn't ready in RAM yet
    if (!resolvedConfig) return null;

    const isDraggingFocusedWindow = window.isDragging && window.isFocused;
    const baseTransitionClass = isDraggingFocusedWindow ? 'duration-0' : 'duration-150';
    
    // NUCLEAR POINTER NUKE: the moment we start dragging, hit-testing is dead for the entire element and its complex children
    const pointerEventsClass = window.isDragging ? '!pointer-events-none' : (window.canCapturePointer ? 'pointer-events-auto' : 'pointer-events-none');

    // OCCLUSION CULLING: automatically hide content if fully covered by another opaque window.
    const hideContent = useAceMemorySelector<Record<string, boolean>, boolean>(
        'system:window_occlusion',
        (dict) => dict?.[resolvedConfig.window_uid] ?? false
    );

    // We let individual react components (like SystemSettings) manage virtualization with react-window.
    const contentRef = useRef<HTMLDivElement>(null);

    // -------------------------------------------------------------------------
    // HEADLESS MODE
    // -------------------------------------------------------------------------
    if (headless) {
        return (
            <div
                {...window.rootProps}
                ref={window.ref}
                className={`absolute top-0 left-0 flex flex-col ${pointerEventsClass} ${className || ''}`}
                style={{
                    ...window.rootStyle,
                    ...style,
                    // Enforce 0 duration on transform during drag for performance, unless user overrides via style
                    transitionDuration: window.isDragging ? '0ms' : undefined,
                }}
            >
                <RenderCounterBadge componentName={`AceWindow:${windowUid ?? resolvedConfig.component}`} />
                <div 
                    ref={contentRef}
                    className="w-full h-full flex flex-col"
                    style={{ contentVisibility: hideContent ? 'hidden' : undefined, contain: hideContent ? 'size layout' : undefined }}
                >
                    {typeof children === 'function' ? children(window) : children}
                </div>
            </div>
        );
    }

    // -------------------------------------------------------------------------
    // STANDARD MODE
    // -------------------------------------------------------------------------
    return (
        <div
            {...window.rootProps}
            ref={window.ref}
            className={`absolute top-0 left-0 flex flex-col rounded-xl transition-[background-color,opacity,transform] ease-out ${baseTransitionClass} ${pointerEventsClass} ${!window.hideRing && (window.isFocused ? 'ring-1 ring-blue-500/50' : 'ring-1 ring-white/10')} ${window.isMounted ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.985]'} ${window.isDragging ? 'overflow-visible' : 'overflow-hidden'} ${className || ''}`}
            style={{
                ...window.rootStyle,
                backgroundColor: window.isBorderless
                    ? 'transparent'
                    : (window.isDragging ? 'rgba(20, 20, 22, 1)' : (window.isFocused ? 'rgba(20, 20, 22, 0.95)' : 'rgba(20, 20, 22, 0.7)')),
                contain: window.isDragging ? 'layout size' : 'none',
                ...style,
            }}
        >

            {!window.isBorderless && (
                <div
                    className={`h-8 flex items-center justify-between px-3 cursor-grab active:cursor-grabbing select-none transition-colors relative ${window.isFocused ? 'bg-white/10 border-b border-white/5' : 'bg-transparent border-b border-transparent'}`}
                    onMouseDown={window.dragHandleProps.onMouseDown}
                >
                    <div className={`flex items-center gap-2 ${window.isFocused ? 'text-white/60' : 'text-white/30'}`}>
                        <GripHorizontal size={14} />
                        <span className="text-xs font-semibold">{resolvedConfig.title || resolvedConfig.component}</span>
                        {resolvedConfig.is_locked && <Lock size={10} className="text-amber-500" />}
                        {resolvedConfig.always_on_top && <BringToFront size={10} className="text-emerald-500" />}
                        <RenderCounterBadge
                            componentName={`AceWindow:${windowUid ?? resolvedConfig.component}`}
                            className="!static !opacity-100 !rounded text-[9px] ml-1"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <button data-window-action="true" className="text-white/40 hover:text-white transition-colors" title="Minimize" onClick={window.minimize}>
                            <Minus size={14} />
                        </button>
                        <button data-window-action="true" className="text-white/40 hover:text-red-400 transition-colors" onClick={window.close} title="Close">
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}

            {window.contextMenu && createPortal(
                <div
                    className="fixed z-[99999] bg-zinc-900 border border-zinc-700/80 rounded-lg py-1 text-xs w-48 text-zinc-300 flex flex-col pointer-events-auto ring-1 ring-black/50"
                    style={{ top: window.contextMenu.y, left: window.contextMenu.x }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    <div className="px-3 py-1.5 text-zinc-500 font-semibold border-b border-zinc-800 mb-1">
                        {resolvedConfig.title || resolvedConfig.component}
                    </div>
                    <button data-window-action="true" onClick={window.toggleLock} className="mx-1 px-2 py-1.5 text-left hover:bg-zinc-800 rounded flex items-center gap-2 transition-colors">
                        {resolvedConfig.is_locked ? <Unlock size={12} className="text-amber-500" /> : <Lock size={12} />}
                        {resolvedConfig.is_locked ? 'Unlock Position' : 'Lock Position'}
                    </button>
                    <button data-window-action="true" onClick={window.toggleAlwaysOnTop} className="mx-1 px-2 py-1.5 text-left hover:bg-zinc-800 rounded flex items-center gap-2 transition-colors">
                        {resolvedConfig.always_on_top ? <Layers size={12} className="text-emerald-500" /> : <BringToFront size={12} />}
                        {resolvedConfig.always_on_top ? 'Disable Always-On-Top' : 'Always On Top'}
                    </button>
                    <div className="h-px bg-zinc-800 my-1 mx-2" />
                    <div className="px-3 py-1 text-zinc-500 font-medium text-[10px] uppercase tracking-wider">Opacity</div>
                    <div className="flex px-2 gap-1 pb-1">
                        {[1, 0.9, 0.75, 0.5, 0.25].map(v => (
                            <button
                                data-window-action="true"
                                key={v}
                                onClick={() => window.setOpacity(v)}
                                className={`flex-1 h-6 rounded hover:bg-zinc-700 active:bg-zinc-600 flex items-center justify-center text-[10px] border border-zinc-700/50 ${resolvedConfig.opacity === v ? 'bg-zinc-700 text-white border-zinc-500' : 'bg-zinc-800/50'}`}
                            >
                                {v * 100}
                            </button>
                        ))}
                    </div>
                </div>,
                document.body
            )}

            {/* 
                AUTO-VIRTUALIZATION ENGINE: 
                We use react-window inside apps to automatically monitor and 
                virtually cull (via content-visibility: hidden) any child components that scroll out of view.
                Zero developer configuration required.
            */}
            <div 
                ref={contentRef}
                className={`flex-1 overflow-auto ${window.isBorderless ? '' : 'p-2'} ${window.isDragging ? 'pointer-events-none' : ''}`}
                style={{
                    // PERF: Force Chromium to promote the scrollable inner component to its own GPU layer.
                    // This stops alpha-composition lag when interacting/scrolling within transparent windows.
                    transform: 'translateZ(0)',
                    willChange: 'transform, scroll-position',
                    contain: 'content',
                    contentVisibility: hideContent ? 'hidden' : undefined,
                }}
            >
                {typeof children === 'function' || children ? (typeof children === 'function' ? children(window) : children) : (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-500 font-mono text-xs opacity-50 p-4 text-center border-2 border-dashed border-zinc-800 rounded">
                        <p>Unregistered Component Schema:</p>
                        <span className="text-red-400 font-bold mt-1 text-sm">{resolvedConfig.component}</span>
                        <p className="mt-4 text-zinc-600">Ensure this component is declared in package registry and loaded by RegistryEngine.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

export const AceWindow = React.memo(AceWindowComponent, (prev, next) => {
    // Optimistic memo: if uids match, we trust the internal O(1) subscription of useAceWindow to handle updates.
    // We only re-render the wrapper if the Window Identity changes (which never happens for same key).
    // EXCEPT when children change, so we must be careful.
    if (prev.windowUid && next.windowUid) {
        return prev.windowUid === next.windowUid && prev.children === next.children;
    }

    const a = prev.config;
    const b = next.config;

    if (!a || !b) return false;

    return (
        a.window_uid === b.window_uid &&
        a.component === b.component &&
        a.payload_memory_uid === b.payload_memory_uid &&
        a.x === b.x &&
        a.y === b.y &&
        a.width === b.width &&
        a.height === b.height &&
        a.z_index === b.z_index &&
        a.opacity === b.opacity &&
        a.is_locked === b.is_locked &&
        a.always_on_top === b.always_on_top &&
        a.chrome_style === b.chrome_style &&
        a.drag_surface === b.drag_surface &&
        a.is_minimized === b.is_minimized &&
        a.title === b.title &&
        prev.children === next.children
    );
});
