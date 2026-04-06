import React, { useState } from 'react';
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

function AceWindowComponent({ windowUid, config, headless, className, style, children }: AceWindowProps) {
    // 1. Initialization & Validations
    const input = windowUid || config;
    const window = useAceWindow(input);
    const resolvedConfig = window?.config || config;

    if (!input || !resolvedConfig) return null;

    // 2. Computed States & Classes
    const isDraggingFocused = window.isDragging && window.isFocused;
    const baseTransitionClass = isDraggingFocused ? 'duration-0' : 'duration-150';
    
    // NUCLEAR POINTER NUKE: Disable hit-testing during drag for performance
    const pointerEventsClass = window.isDragging 
        ? '!pointer-events-none' 
        : (window.canCapturePointer ? 'pointer-events-auto' : 'pointer-events-none');

    const pointerEventsContentClass = window.isHovered ? 'pointer-events-auto' : 'pointer-events-none';

    // OCCLUSION CULLING
    const hideContent = useAceMemorySelector<Record<string, boolean>, boolean>(
        'system:window_occlusion',
        (dict) => dict?.[resolvedConfig.window_uid] ?? false
    );

    const contentVisibilityValue = hideContent ? 'hidden' : (window.isHovered ? 'visible' : 'auto');

    // 3. Content Resolution
    const realContent = typeof children === 'function' ? children(window) : children;
    const contentNode = realContent || (
        <div className="flex flex-col items-center justify-center h-full text-zinc-500 font-mono text-xs opacity-50 p-4 text-center border-2 border-dashed border-zinc-800 rounded">
            <p>Unregistered Component Schema:</p>
            <span className="text-red-400 font-bold mt-1 text-sm">{resolvedConfig.component}</span>
            <p className="mt-4 text-zinc-600">Ensure this component is declared in package registry and loaded by RegistryEngine.</p>
        </div>
    );

    // Shared inner content wrapper for both Standard and Headless modes
    const InnerContent = (
        <div 
            className={`w-full h-full flex-1 overflow-auto relative transition-opacity duration-150 contain-[strict] ${window.isBorderless ? '' : 'p-2'} ${window.isDragging ? 'pointer-events-none' : ''}`}
            style={{
                contentVisibility: contentVisibilityValue,
                contain: hideContent ? 'size layout' : undefined,
                // PERF: Promote to GPU layer to prevent alpha-composition lag
                transform: 'translateZ(0)',
                willChange: 'transform, scroll-position',
            }}
        >
            {contentNode}
        </div>
    );

    const renderContextMenu = () => {
        if (!window.contextMenu) return null;

        return createPortal(
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
        );
    };

    // -------------------------------------------------------------------------
    // HEADLESS MODE
    // -------------------------------------------------------------------------
    if (headless) {
        return (
            <div
                {...window.rootProps}
                ref={window.ref}
                className={`group absolute top-0 left-0 flex flex-col ${pointerEventsClass} ${className || ''}`}
                style={{
                    ...window.rootStyle,
                    ...style,
                    transitionDuration: window.isDragging ? '0ms' : undefined,
                }}
            >
                <RenderCounterBadge componentName={`AceWindow:${windowUid ?? resolvedConfig.component}`} />
                {InnerContent}
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
            className={`group absolute top-0 left-0 flex flex-col rounded-xl transition-[background-color,opacity,transform] ease-out ${baseTransitionClass} ${pointerEventsClass} ${!window.hideRing && (window.isFocused ? 'ring-1 ring-blue-500/50' : 'ring-1 ring-white/10')} ${window.isMounted ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.985]'} ${window.isDragging ? 'overflow-visible' : 'overflow-hidden'} ${className || ''}`}
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
                    className={`h-8 flex items-center justify-between px-3 cursor-grab active:cursor-grabbing select-none transition-all duration-150 relative ${pointerEventsContentClass} ${window.isFocused ? 'bg-white/10 border-b border-white/5' : 'bg-transparent border-b border-transparent'}`}
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

            {renderContextMenu()}
            {InnerContent}
        </div>
    );
}

// Shallow equality helper for objects
const shallowEqual = (objA: any, objB: any) => {
    if (Object.is(objA, objB)) return true;
    if (typeof objA !== 'object' || objA === null || typeof objB !== 'object' || objB === null) return false;
    
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);
    
    if (keysA.length !== keysB.length) return false;
    for (let i = 0; i < keysA.length; i++) {
        if (!Object.prototype.hasOwnProperty.call(objB, keysA[i]) || !Object.is(objA[keysA[i]], objB[keysA[i]])) {
            return false;
        }
    }
    return true;
};

export const AceWindow = React.memo(AceWindowComponent, (prev, next) => {
    // 1. If children change, always re-render
    if (prev.children !== next.children) return false;

    // 2. Trust O(1) subscription if uids match and are provided
    if (prev.windowUid && next.windowUid) {
        return prev.windowUid === next.windowUid;
    }

    // 3. Fallback: robust shallow config comparison
    if (!prev.config || !next.config) return false;
    return shallowEqual(prev.config, next.config);
});