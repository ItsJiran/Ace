import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WindowConfig } from '#/schemas/window';
import type { AnimationRuntimeState } from '#/schemas/animation';
import { WindowEngine } from '#/services/windowEngine';
import { Storage } from '#/services/storageEngine';
import { GripHorizontal, X, Minus, Lock, Unlock, BringToFront, Layers } from 'lucide-react';
import { ComponentRegistry } from '#/features/registry/ComponentRegistry';
import { useAceMemory } from '#/hooks/useAceMemory';
import { GlobalStateManager } from '#/services/globalStateManager';

function BaseWindowComponent({ config }: { config: WindowConfig }) {
    const isFocused = config.is_focused;
    const mouseFocusEnabled = useAceMemory<boolean>('system:mouse_focus_enabled') ?? true;
    const canCapturePointer = mouseFocusEnabled;
    const chromeStyle = config.chrome_style ?? 'standard';
    const dragSurface = config.drag_surface ?? 'header';
    const isBorderless = chromeStyle === 'borderless';
    const isFullDrag = dragSurface === 'full';
    const hideRing = config.hide_ring ?? false;
    
    const [isMounted, setIsMounted] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);
    const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
    const dragPositionRef = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        const id = window.setTimeout(() => setIsMounted(true), 10);
        return () => window.clearTimeout(id);
    }, []);

    // Close context menu on click outside or interaction
    useEffect(() => {
        const closeMenu = () => setContextMenu(null);
        if (contextMenu) {
            window.addEventListener('click', closeMenu);
        }
        return () => window.removeEventListener('click', closeMenu);
    }, [contextMenu]);

    useEffect(() => {
        if (!isDragging) {
            setDragPosition(null);
            dragPositionRef.current = null;
        }
    }, [isDragging]);

    // Keep drag fluid: disable transform transition while dragging focused window.
    const isDraggingFocusedWindow = isDragging && isFocused;

    const handleFocus = () => {
        // Allow focusing even if locked, just not dragging
        if (!mouseFocusEnabled) return;

        // Always re-assert focus on click when mouse focus is enabled.
        WindowEngine.focusWindow(config.window_uid);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY }); // Global client coords
    };

    const toggleLock = () => WindowEngine.updateWindowConfig(config.window_uid, { is_locked: !config.is_locked });
    const toggleAlwaysOnTop = () => WindowEngine.updateWindowConfig(config.window_uid, { always_on_top: !config.always_on_top });
    const setOpacity = (val: number) => WindowEngine.updateWindowConfig(config.window_uid, { opacity: val });

    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation();
        WindowEngine.closeWindow(config.window_uid);
    };

    const beginDrag = (e: React.MouseEvent) => {
        if (!canCapturePointer || config.is_locked) return;
        if (e.button !== 0) return;

        const allAnimations = Storage.readMemory('system:window_animations') as Record<string, AnimationRuntimeState> | undefined;
        const animState = allAnimations?.[config.window_uid];
        const interruptPolicy = animState?.is_running ? animState.interrupt_policy as 'lock' | 'retarget' | 'cancel' | undefined : undefined;

        // lock: drag is ignored while sequence is running.
        if (interruptPolicy === 'lock') {
            return;
        }

        // cancel: dragging immediately stops current sequence.
        if (interruptPolicy === 'cancel') {
            WindowEngine.cancelAnimation(config.window_uid);
        }

        e.preventDefault();
        e.stopPropagation();

        handleFocus();
        GlobalStateManager.setPointerDown(true); // Signal to WindowEngine we are dragging
        
        const startX = e.clientX; 
        const startY = e.clientY;
        const initialX = config.x;
        const initialY = config.y;
        setIsDragging(true);
        let rafId: number | null = null;
        let nextX = initialX;
        let nextY = initialY;

        const flush = () => {
            rafId = null;
            const nextPos = { x: nextX, y: nextY };
            dragPositionRef.current = nextPos;
            setDragPosition(nextPos);
        };

        const onMouseMove = (moveEvent: MouseEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            nextX = initialX + dx;
            nextY = initialY + dy;

            // retarget: animation remains alive but follows drag destination.
            if (interruptPolicy === 'retarget') {
                WindowEngine.retargetAnimation(config.window_uid, {
                    x: nextX,
                    y: nextY,
                    width: config.width,
                    height: config.height,
                });
            }

            // Keep drag smooth while avoiding write floods.
            if (rafId !== null) return;
            rafId = window.requestAnimationFrame(flush);
        };

        const onMouseUp = () => {
             if (rafId !== null) {
                window.cancelAnimationFrame(rafId);
                flush();
            }

            const finalPosition = dragPositionRef.current;
            if (finalPosition) {
                WindowEngine.updateWindowBounds(
                    config.window_uid,
                    finalPosition.x,
                    finalPosition.y,
                    config.width,
                    config.height
                );
            }

            setIsDragging(false);
            GlobalStateManager.setPointerDown(false); // Signal end of drag
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const handleDragStart = (e: React.MouseEvent) => {
        if (isFullDrag) return;
        beginDrag(e);
    };

    const handleRootMouseDown = (e: React.MouseEvent) => {
        handleFocus();

        if (!isFullDrag) return;

        const target = e.target as HTMLElement | null;
        if (target?.closest('[data-window-action="true"]')) return;
        beginDrag(e);
    };

    return (
        <div
            id={`window-${config.window_uid}`}
            onMouseDown={handleRootMouseDown}
            onContextMenu={handleContextMenu}
            onMouseEnter={() => WindowEngine.enterWindowSurface(config.window_uid)}
            onMouseLeave={() => WindowEngine.leaveWindowSurface(config.window_uid)}
            className={`absolute top-0 left-0 flex flex-col rounded-xl overflow-hidden shadow-2xl transition-[transform,box-shadow,background-color,opacity] ease-out ${isDraggingFocusedWindow ? 'duration-0' : 'duration-150'} ${canCapturePointer ? 'pointer-events-auto' : 'pointer-events-none'} ${!hideRing && (isFocused ? 'ring-1 ring-blue-500/50 shadow-blue-900/20' : 'ring-1 ring-white/10')} ${isMounted ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.985]'}`}
            style={{
                transform: `translate3d(${(dragPosition?.x ?? config.x)}px, ${(dragPosition?.y ?? config.y)}px, 0)`,
                width: config.width,
                height: config.height,
                zIndex: config.always_on_top ? 9999 + config.z_index : config.z_index,
                opacity: config.opacity ?? 1,
                backgroundColor: isBorderless
                    ? 'transparent'
                    : (isFocused ? 'rgba(20, 20, 22, 0.95)' : 'rgba(20, 20, 22, 0.7)'),
                boxShadow: isDraggingFocusedWindow ? 'none' : undefined,
                willChange: 'transform'
            }}
        >
            {!isBorderless && (
                <div
                    className={`h-8 flex items-center justify-between px-3 cursor-grab active:cursor-grabbing select-none transition-colors relative ${isFocused ? 'bg-white/10 border-b border-white/5' : 'bg-transparent border-b border-transparent'}`}
                    onMouseDown={handleDragStart}
                >
                    <div className={`flex items-center gap-2 ${isFocused ? 'text-white/60' : 'text-white/30'}`}>
                        <GripHorizontal size={14} />
                        <span className="text-xs font-semibold">{config.title || config.component_name}</span>
                        {config.is_locked && <Lock size={10} className="text-amber-500" />}
                        {config.always_on_top && <BringToFront size={10} className="text-emerald-500" />}
                    </div>
                    <div className="flex items-center gap-2">
                        <button data-window-action="true" className="text-white/40 hover:text-white transition-colors" title="Minimize">
                            <Minus size={14} />
                        </button>
                        <button data-window-action="true" className="text-white/40 hover:text-red-400 transition-colors" onClick={handleClose} title="Close">
                            <X size={14} />
                        </button>
                    </div>
                </div>
            )}

            {contextMenu && createPortal(
                <div
                    className="fixed z-[99999] bg-zinc-900 border border-zinc-700/80 rounded-lg shadow-xl py-1 text-xs w-48 text-zinc-300 flex flex-col pointer-events-auto ring-1 ring-black/50"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    <div className="px-3 py-1.5 text-zinc-500 font-semibold border-b border-zinc-800 mb-1">
                        {config.title || config.component_name}
                    </div>
                    <button data-window-action="true" onClick={toggleLock} className="mx-1 px-2 py-1.5 text-left hover:bg-zinc-800 rounded flex items-center gap-2 transition-colors">
                        {config.is_locked ? <Unlock size={12} className="text-amber-500" /> : <Lock size={12} />}
                        {config.is_locked ? 'Unlock Position' : 'Lock Position'}
                    </button>
                    <button data-window-action="true" onClick={toggleAlwaysOnTop} className="mx-1 px-2 py-1.5 text-left hover:bg-zinc-800 rounded flex items-center gap-2 transition-colors">
                        {config.always_on_top ? <Layers size={12} className="text-emerald-500" /> : <BringToFront size={12} />}
                        {config.always_on_top ? 'Disable Always-On-Top' : 'Always On Top'}
                    </button>
                    <div className="h-px bg-zinc-800 my-1 mx-2" />
                    <div className="px-3 py-1 text-zinc-500 font-medium text-[10px] uppercase tracking-wider">Opacity</div>
                    <div className="flex px-2 gap-1 pb-1">
                        {[1, 0.9, 0.75, 0.5, 0.25].map(v => (
                            <button
                                data-window-action="true"
                                key={v}
                                onClick={() => setOpacity(v)}
                                className={`flex-1 h-6 rounded hover:bg-zinc-700 active:bg-zinc-600 flex items-center justify-center text-[10px] border border-zinc-700/50 ${config.opacity === v ? 'bg-zinc-700 text-white border-zinc-500' : 'bg-zinc-800/50'}`}
                            >
                                {v * 100}
                            </button>
                        ))}
                    </div>
                </div>,
                document.body
            )}

            <div className={`flex-1 overflow-auto ${isBorderless ? '' : 'p-2'}`}>
                <ComponentRegistry
                    componentName={config.component_name}
                    windowUid={config.window_uid}
                    payloadMemoryUid={config.payload_memory_uid}
                />
            </div>
        </div>
    );
}

export const BaseWindow = React.memo(BaseWindowComponent, (prev, next) => {
    const a = prev.config;
    const b = next.config;

    return (
        a.window_uid === b.window_uid &&
        a.component_name === b.component_name &&
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
        a.is_focused === b.is_focused &&
        a.is_minimized === b.is_minimized &&
        a.title === b.title
    );
});
