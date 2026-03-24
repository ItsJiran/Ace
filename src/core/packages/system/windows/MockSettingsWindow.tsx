import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { X, Minus, GripHorizontal } from 'lucide-react';
import MockSettings from '../components/MockSettings';
import type { WindowConfig } from '#/schemas/window';
import { StorageEngine } from '#/services/storageEngine';
import { WindowEngine } from '#/services/windowEngine';

export const registry: AceRegistryType.Window = {
    name: 'Mock Settings Window',
    slug: 'mock-settings-window',
    react_behavior: 'window_shell',
};

type WindowShellProps = {
    title: string;
    isDragging: boolean;
    isMounted: boolean;
    isFocused: boolean;
    close: () => void;
    onDragStart: (e: ReactMouseEvent<HTMLDivElement>) => void;
};

function MockSettingsShell({
    title,
    isDragging,
    isMounted,
    isFocused,
    close,
    onDragStart,
}: WindowShellProps) {
    return (
        <div
            className={`
                flex flex-col w-full h-full overflow-hidden pointer-events-auto
                rounded-[20px]
                bg-[#F0F2F7] dark:bg-[#0F121A]
                border border-[#E3E7F0] dark:border-[#2A3142]
                transition-[opacity,transform,box-shadow] ease-out
                ${isDragging ? 'duration-0' : 'duration-200'}
                ${isMounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
                ${isFocused ? 'ring-1 ring-purple-500/20 dark:ring-purple-500/30' : ''}
            `}
            style={{ contain: 'layout paint style' }}
        >
            {/* Custom Header */}
            <div
                className={`h-12 flex items-center justify-between px-5 select-none shrink-0 border-b border-[#E3E7F0] dark:border-[#2A3142] bg-white/50 dark:bg-[#171C27]/50 cursor-grab active:cursor-grabbing group ${isDragging ? '' : 'hover:bg-white/80 dark:hover:bg-[#171C27]/80'}`}
                onMouseDown={onDragStart}
                style={{ willChange: isDragging ? 'auto' : 'background-color' }}
            >
                <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
                        <GripHorizontal size={14} />
                    </div>
                    <span className="font-medium text-sm text-[#171A23] dark:text-[#E9EDF7]">
                        {title}
                    </span>
                </div>
                <div className={`flex items-center gap-2 ${isDragging ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`} style={{ transitionDuration: isDragging ? '0ms' : '200ms' }}>
                    <button
                        className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 dark:text-slate-400"
                        title="Minimize"
                    >
                        <Minus size={16} />
                    </button>
                    <button
                        onClick={close}
                        className="p-1.5 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 dark:text-slate-400"
                        title="Close"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 relative overflow-hidden bg-white dark:bg-[#171C27]" style={{ contentVisibility: 'auto' }}>
                <MockSettings />
            </div>
        </div>
    );
}

export default function MockSettingsWindow({ windowUid }: { windowUid: string }) {
    const initialConfig = useState<WindowConfig | null>(() => {
        return (StorageEngine.readMemory(`system:window:${windowUid}`) as WindowConfig | undefined) ?? null;
    })[0];

    const [isMounted, setIsMounted] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [position, setPosition] = useState(() => ({
        x: initialConfig?.x ?? 100,
        y: initialConfig?.y ?? 100,
    }));

    const elementRef = useRef<HTMLDivElement | null>(null);
    const positionRef = useRef(position);

    useEffect(() => {
        positionRef.current = position;
    }, [position]);

    useEffect(() => {
        const id = window.setTimeout(() => setIsMounted(true), 10);
        return () => window.clearTimeout(id);
    }, []);

    useLayoutEffect(() => {
        if (!elementRef.current) return;
        elementRef.current.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
    }, [position.x, position.y]);

    const close = useCallback(() => {
        WindowEngine.closeWindow(windowUid);
    }, [windowUid]);

    const beginDrag = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
        if (!initialConfig || initialConfig.is_locked || e.button !== 0) return;

        e.preventDefault();
        e.stopPropagation();

        setIsFocused(true);
        setIsDragging(true);

        const startX = e.clientX;
        const startY = e.clientY;
        const originX = positionRef.current.x;
        const originY = positionRef.current.y;

        const onMouseMove = (moveEvent: MouseEvent) => {
            const nextX = originX + (moveEvent.clientX - startX);
            const nextY = originY + (moveEvent.clientY - startY);

            positionRef.current = { x: nextX, y: nextY };

            const el = elementRef.current;
            if (el) {
                el.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
            }
        };

        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);

            setPosition(positionRef.current);
            setIsDragging(false);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, [initialConfig]);

    if (!initialConfig) return null;

    return (
        <div
            ref={elementRef}
            className="absolute top-0 left-0 flex flex-col pointer-events-auto"
            style={{
                width: initialConfig.width,
                height: initialConfig.height,
                zIndex: initialConfig.z_index,
                opacity: initialConfig.opacity ?? 1,
                willChange: 'transform',
                transitionDuration: isDragging ? '0ms' : undefined,
            }}
            onMouseDown={() => setIsFocused(true)}
        >
            <MockSettingsShell
                title={initialConfig.title || 'Mock Settings (Pure Local State)'}
                isDragging={isDragging}
                isMounted={isMounted}
                isFocused={isFocused}
                close={close}
                onDragStart={beginDrag}
            />
        </div>
    );
}
