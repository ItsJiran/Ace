import React from 'react';
import type { WindowConfig } from '#/schemas/window';
import { WindowEngine } from '#/services/windowEngine';
import { GripHorizontal, X, Minus } from 'lucide-react';
import { ComponentRegistry } from '#/features/registry/ComponentRegistry';

export function BaseWindow({ config }: { config: WindowConfig }) {
    const isFocused = config.is_focused;

    const handleFocus = () => {
        if (!isFocused) WindowEngine.focusWindow(config.window_uid);
    };

    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation();
        WindowEngine.closeWindow(config.window_uid);
    };

    const handleDragStart = (e: React.MouseEvent) => {
        // Only drag from the header area, prevent text selection
        e.preventDefault();
        e.stopPropagation();

        handleFocus();
        const startX = e.clientX;
        const startY = e.clientY;
        const initialX = config.x;
        const initialY = config.y;

        const onMouseMove = (moveEvent: MouseEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;

            // Send coordinates straight to Global RAM.
            // App.tsx's useStorage('system:windows') will natively trigger a fast re-render.
            WindowEngine.updateWindowBounds(
                config.window_uid,
                initialX + dx,
                initialY + dy,
                config.width,
                config.height
            );
        };

        const onMouseUp = () => {
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
            className={`absolute top-0 left-0 flex flex-col rounded-xl overflow-hidden pointer-events-auto shadow-2xl transition-[box-shadow,background-color] ${isFocused ? 'ring-1 ring-blue-500/50 shadow-blue-900/20' : 'ring-1 ring-white/10'}`}
            style={{
                transform: `translate3d(${config.x}px, ${config.y}px, 0)`,
                width: config.width,
                height: config.height,
                zIndex: config.z_index,
                // The Dual-Mode Container Logic
                backgroundColor: isFocused ? 'rgba(20, 20, 22, 0.95)' : 'rgba(20, 20, 22, 0.7)',
                backdropFilter: 'blur(16px)',
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
