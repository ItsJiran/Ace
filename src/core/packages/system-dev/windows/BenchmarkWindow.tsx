import React, { useState, useRef, useEffect } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { useRenderCount } from '#/hooks/useRenderCount';
import { X, GripHorizontal } from 'lucide-react';

export const registry: AceRegistryType.Window = {
    name: 'Benchmark Window (Pure)',
    slug: 'benchmark-window',
    react_behavior: 'window_shell',
};

export default function BenchmarkWindow({ onClose }: { onClose?: () => void }) {
    const renderCount = useRenderCount('BenchmarkWindow');
    
    // Local state for position - no global store
    const [position, setPosition] = useState({ x: 300, y: 300 });
    const [isDragging, setIsDragging] = useState(false);
    
    const dragOffset = useRef({ x: 0, y: 0 });

    useEffect(() => {
        if (!isDragging) return;

        const onMouseMove = (e: MouseEvent) => {
            // Standard React state update on every move (High Render Pressure)
            setPosition({
                x: e.clientX - dragOffset.current.x,
                y: e.clientY - dragOffset.current.y
            });
        };

        const onMouseUp = () => {
            setIsDragging(false);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [isDragging]);

    const startDrag = (e: React.MouseEvent) => {
        setIsDragging(true);
        dragOffset.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
    };

    return (
        <div 
            className="fixed flex flex-col w-64 h-48 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden"
            style={{ 
                left: position.x, 
                top: position.y,
                zIndex: 99999 // Always on top for test
            }}
        >
            {/* Header */}
            <div 
                className="h-8 bg-zinc-800 border-b border-zinc-700 flex items-center justify-between px-2 cursor-grab active:cursor-grabbing select-none"
                onMouseDown={startDrag}
            >
                <div className="flex items-center gap-2 text-zinc-400">
                    <GripHorizontal size={14} />
                    <span className="text-xs font-bold">Pure React Window</span>
                </div>
                {import.meta.env.DEV && (
                    <span className="bg-red-500/80 text-white text-[9px] font-bold px-1 rounded opacity-50">
                        R:{renderCount}
                    </span>
                )}
                
                {onClose && (
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                        className="text-zinc-500 hover:text-zinc-100 p-1 rounded hover:bg-white/10 transition-colors"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            {/* Content */}
            <div className="p-4 text-zinc-400 text-xs font-mono space-y-2">
                <p>No Global State.</p>
                <p>No AceWindow.</p>
                <p>Pure React useState.</p>
                <p className="text-zinc-500 mt-2">
                    Coordinates: {position.x}, {position.y}
                </p>
            </div>
        </div>
    );
}