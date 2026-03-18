import React from 'react';
import { createPortal } from 'react-dom';
import type { WindowConfig } from '#/schemas/window';
import { useAceWindow } from '#/hooks/useAceWindow';
import { GripHorizontal, X, Minus, Lock, Unlock, BringToFront, Layers } from 'lucide-react';
import { ComponentRegistry } from '#/core/packages/system/components/ComponentRegistry';

function AceWindowComponent({ config }: { config: WindowConfig }) {
    const window = useAceWindow(config);
    const isDraggingFocusedWindow = window.isDragging && window.isFocused;

    return (
        <div
            {...window.rootProps}
            className={`absolute top-0 left-0 flex flex-col rounded-xl overflow-hidden shadow-2xl transition-[transform,box-shadow,background-color,opacity] ease-out ${isDraggingFocusedWindow ? 'duration-0' : 'duration-150'} ${window.canCapturePointer ? 'pointer-events-auto' : 'pointer-events-none'} ${!window.hideRing && (window.isFocused ? 'ring-1 ring-blue-500/50 shadow-blue-900/20' : 'ring-1 ring-white/10')} ${window.isMounted ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.985]'}`}
            style={{
                ...window.rootStyle,
                backgroundColor: window.isBorderless
                    ? 'transparent'
                    : (window.isFocused ? 'rgba(20, 20, 22, 0.95)' : 'rgba(20, 20, 22, 0.7)'),
                boxShadow: isDraggingFocusedWindow ? 'none' : undefined,
            }}
        >
            {!window.isBorderless && (
                <div
                    className={`h-8 flex items-center justify-between px-3 cursor-grab active:cursor-grabbing select-none transition-colors relative ${window.isFocused ? 'bg-white/10 border-b border-white/5' : 'bg-transparent border-b border-transparent'}`}
                    onMouseDown={window.dragHandleProps.onMouseDown}
                >
                    <div className={`flex items-center gap-2 ${window.isFocused ? 'text-white/60' : 'text-white/30'}`}>
                        <GripHorizontal size={14} />
                        <span className="text-xs font-semibold">{config.title || config.component_name}</span>
                        {config.is_locked && <Lock size={10} className="text-amber-500" />}
                        {config.always_on_top && <BringToFront size={10} className="text-emerald-500" />}
                    </div>
                    <div className="flex items-center gap-2">
                        <button data-window-action="true" className="text-white/40 hover:text-white transition-colors" title="Minimize">
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
                    className="fixed z-[99999] bg-zinc-900 border border-zinc-700/80 rounded-lg shadow-xl py-1 text-xs w-48 text-zinc-300 flex flex-col pointer-events-auto ring-1 ring-black/50"
                    style={{ top: window.contextMenu.y, left: window.contextMenu.x }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onContextMenu={(e) => e.preventDefault()}
                >
                    <div className="px-3 py-1.5 text-zinc-500 font-semibold border-b border-zinc-800 mb-1">
                        {config.title || config.component_name}
                    </div>
                    <button data-window-action="true" onClick={window.toggleLock} className="mx-1 px-2 py-1.5 text-left hover:bg-zinc-800 rounded flex items-center gap-2 transition-colors">
                        {config.is_locked ? <Unlock size={12} className="text-amber-500" /> : <Lock size={12} />}
                        {config.is_locked ? 'Unlock Position' : 'Lock Position'}
                    </button>
                    <button data-window-action="true" onClick={window.toggleAlwaysOnTop} className="mx-1 px-2 py-1.5 text-left hover:bg-zinc-800 rounded flex items-center gap-2 transition-colors">
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
                                onClick={() => window.setOpacity(v)}
                                className={`flex-1 h-6 rounded hover:bg-zinc-700 active:bg-zinc-600 flex items-center justify-center text-[10px] border border-zinc-700/50 ${config.opacity === v ? 'bg-zinc-700 text-white border-zinc-500' : 'bg-zinc-800/50'}`}
                            >
                                {v * 100}
                            </button>
                        ))}
                    </div>
                </div>,
                document.body
            )}

            <div className={`flex-1 overflow-auto ${window.isBorderless ? '' : 'p-2'}`}>
                <ComponentRegistry
                    componentName={config.component_name}
                    windowUid={config.window_uid}
                    payloadMemoryUid={config.payload_memory_uid}
                />
            </div>
        </div>
    );
}

export const AceWindow = React.memo(AceWindowComponent, (prev, next) => {
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
