import React, { useEffect, useRef, useState } from 'react';
import type { WindowConfig } from '#/schemas/window';
import { WindowEngine } from '#/services/windowEngine';
import { GripHorizontal, X, Minus } from 'lucide-react';
import { ComponentRegistry } from '#/features/registry/ComponentRegistry';
import { useAceMemory } from '#/hooks/useAceMemory';

function BaseWindowComponent({ config }: { config: WindowConfig }) {
    const isFocused = config.is_focused;
    const mouseFocusEnabled = useAceMemory<boolean>('system:mouse_focus_enabled') ?? true;
    const canCapturePointer = mouseFocusEnabled;
    const [isMounted, setIsMounted] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
    const dragPositionRef = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        const id = window.setTimeout(() => setIsMounted(true), 10);
        return () => window.clearTimeout(id);
    }, []);

    useEffect(() => {
        if (!isDragging) {
            setDragPosition(null);
            dragPositionRef.current = null;
        }
    }, [isDragging]);

    // Keep drag fluid: disable transform transition while dragging focused window.
    const isDraggingFocusedWindow = isDragging && isFocused;

    const handleFocus = () => {
        if (!canCapturePointer) return;

        // Always re-assert focus on click when mouse focus is enabled.
        // A window can stay marked `is_focused` in RAM while native focus/capture
        // has been released after interacting with external windows.
        WindowEngine.focusWindow(config.window_uid);
    };

    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation();
        WindowEngine.closeWindow(config.window_uid);
    };

    const handleDragStart = (e: React.MouseEvent) => {
        if (!canCapturePointer) return;

        // Only drag from the header area, prevent text selection
        e.preventDefault();
        e.stopPropagation();

        handleFocus();
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
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    return (
        <div
            id={`window-${config.window_uid}`}
            onMouseDown={handleFocus}
            onMouseEnter={() => WindowEngine.enterWindowSurface(config.window_uid)}
            onMouseLeave={() => WindowEngine.leaveWindowSurface(config.window_uid)}
            className={`absolute top-0 left-0 flex flex-col rounded-xl overflow-hidden shadow-2xl transition-[transform,box-shadow,background-color,opacity] ease-out ${isDraggingFocusedWindow ? 'duration-0' : 'duration-150'} ${canCapturePointer ? 'pointer-events-auto' : 'pointer-events-none'} ${isFocused ? 'ring-1 ring-blue-500/50 shadow-blue-900/20' : 'ring-1 ring-white/10'} ${isMounted ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.985]'}`}
            style={{
                transform: `translate3d(${(dragPosition?.x ?? config.x)}px, ${(dragPosition?.y ?? config.y)}px, 0)`,
                width: config.width,
                height: config.height,
                zIndex: config.z_index,
                // The Dual-Mode Container Logic
                backgroundColor: isFocused ? 'rgba(20, 20, 22, 0.95)' : 'rgba(20, 20, 22, 0.7)',
                backdropFilter: isDraggingFocusedWindow ? 'none' : (isFocused ? 'none' : 'blur(4px)'),
                boxShadow: isDraggingFocusedWindow ? 'none' : undefined,
                willChange: 'transform'
            }}
        >
            {/* Native OS-like Drag Header */}
            <div
                className={`h-8 flex items-center justify-between px-3 cursor-grab active:cursor-grabbing select-none transition-colors ${isFocused ? 'bg-white/10 border-b border-white/5' : 'bg-transparent border-b border-transparent'}`}
                onMouseDown={handleDragStart}
            >
                <div className={`flex items-center gap-2 ${isFocused ? 'text-white/60' : 'text-white/30'}`}>
                    <GripHorizontal size={14} />
                    <span className="text-xs font-semibold">{config.title || config.component_name}</span>
                </div>
                <div className="flex items-center gap-2">
                    <button className="text-white/40 hover:text-white transition-colors" title="Minimize">
                        <Minus size={14} />
                    </button>
                    <button className="text-white/40 hover:text-red-400 transition-colors" onClick={handleClose} title="Close">
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Component Body - Rendering from the Dynamic Registry */}
            <div className="flex-1 overflow-auto p-2">
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
        a.is_focused === b.is_focused &&
        a.is_minimized === b.is_minimized &&
        a.title === b.title
    );
});
