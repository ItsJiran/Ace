import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import type { PanInfo } from 'framer-motion';
import type { DesktopState } from '#/schemas/state.ts';
import type { WindowConfig } from '#/schemas/window';
import { WindowEngine } from '#/engines/window-engine';
import { StateEngine } from '#/engines/state-engine.ts';
import { useAceMemory, useAceMemorySelector } from '#/hooks/use-ace-memory';
import type { WindowAnimationSnapshot } from '#/engines/window/window-animation-engine';

type DragStartEvent = ReactMouseEvent<HTMLElement> | React.PointerEvent<HTMLElement>;
type ResizeStartEvent = React.PointerEvent<HTMLElement>;
type ResizeDirection = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const MIN_WINDOW_WIDTH = 240;
const MIN_WINDOW_HEIGHT = 160;

export interface AceWindowRenderProps {
    dragHandleProps: {
        onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    };
    resizeHandleProps: {
        onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    };
    getResizeHandleProps: (direction: ResizeDirection) => {
        onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    };
    close: () => void;
    minimize: () => void;
    focus: () => void;
    isFocused: boolean;
    isActive: boolean;
    isDragging: boolean;
    isResizing: boolean;
    isResizeAble: boolean;
    isLocked: boolean;
    canCapturePointer: boolean;
    resolveWindowStateClass: () => string;
    windowUid: string;
    windowConfig?: WindowConfig;
}

export interface AceWindowHookResult extends AceWindowRenderProps {
    rootStyle: CSSProperties;
    position: {
        x: number;
        y: number;
    };
    size: {
        width: number;
        height: number;
    };
    animationState?: WindowAnimationSnapshot;
    isHovered: boolean;
    isMounted: boolean;
    setOpacity: (opacity: number) => void;
    updateConfig: (partial: Partial<WindowConfig>) => void;
    updateBounds: (x: number, y: number, width: number, height: number) => void;
    toggleLock: () => void;
    toggleAlwaysOnTop: () => void;
    beginDrag: (event: DragStartEvent, startDrag?: () => void) => void;
    handleDragStart: () => void;
    handleDrag: (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
    handleDragEnd: (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
    handlePointerEnter: () => void;
    handlePointerLeave: () => void;
    beginResize: (direction: ResizeDirection, event: ResizeStartEvent) => void;
    ref: React.RefObject<HTMLDivElement | null>;
}

type ResizeSession = {
    direction: ResizeDirection;
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    startWidth: number;
    startHeight: number;
};

// -----------------------------------------------------------------------------
// Hook Contract Types
// -----------------------------------------------------------------------------

/**
 * useAceWindow
 *
 * Headless runtime bridge for ACE window lifecycle.
 *
 * Purpose:
 * 1) Keep spatial/runtime behavior consistent across core and package UIs.
 * 2) Expose event handlers and runtime actions without forcing visual style.
 * 3) Provide animation bridge APIs so custom windows can integrate with
 *    WindowEngine motion runtime without re-implementing orchestration.
 *
 * Important design rule:
 * - This hook does not render any DOM.
 * - Consumers own all markup and CSS.
 */
export function useAceWindow(window_uid : string): AceWindowHookResult {
    // -------------------------------------------------------------------------
    // Runtime Memory Subscriptions
    // -------------------------------------------------------------------------

    // Resolve runtime identity.
    const windowUid = window_uid;
    const windowConfig = useAceMemory<WindowConfig>(`system:window:${windowUid}`); // contoning current global window state
    const animationState = useAceMemory<WindowAnimationSnapshot>(`system:window_animation:${windowUid}`);

    // OPTIMIZATION: Removed global animation subscription (`system:window_animations`).
    // Previously, every AceWindow re-rendered whenever ANY window animated.
    // We now fetch animation state on-demand during interactions, or rely on specific visual keys if needed.
    const mouseFocusEnabled = useAceMemory<boolean>('system:global_state:mouse_focus_enabled') ?? true;
    const windowDisplayMode = useAceMemorySelector<DesktopState | undefined, DesktopState['window_display_mode']>(
        'system:global_state:desktop',
        (state) => state?.window_display_mode ?? 'all_visible',
    );

    // -------------------------------------------------------------------------
    const elementRef = useRef<HTMLDivElement | null>(null);

    // -------------------------------------------------------------------------
    // Local Interaction State (transient, high-frequency)
    // -------------------------------------------------------------------------

    const [isMounted, setIsMounted] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const isFocused = useAceMemorySelector<string | null, boolean>(
        'system:global_state:focused_window',
        (focusedUid) => focusedUid === windowUid
    );
    const isActive = useAceMemorySelector<string | null, boolean>(
        'system:global_state:active_window',
        (activeUid) => activeUid === windowUid
    );

    // ARCHITECTURE: Window position is LOCAL state, not subscribed from global
    // This completely isolates position updates from global cascades.
    // Initialize once from config, then manage locally during interactions.
    // Only commit to global on drag-end.
    const [localX, setLocalX] = useState<number | null>(null);
    const [localY, setLocalY] = useState<number | null>(null);
    const [localWidth, setLocalWidth] = useState<number | null>(null);
    const [localHeight, setLocalHeight] = useState<number | null>(null);
    const dragOriginRef = useRef({ x: 0, y: 0 });
    const resizeSessionRef = useRef<ResizeSession>({
        direction: 'se',
        startX: 0,
        startY: 0,
        startLeft: 0,
        startTop: 0,
        startWidth: 0,
        startHeight: 0,
    });

    // Initialize local position when config first becomes available.
    // Important: config for string input may arrive AFTER mount from RAM sync.
    useEffect(() => {
        if (!windowConfig || isDragging || isResizing) {
            return;
        }

        const frameId = window.requestAnimationFrame(() => {
            setLocalX((currentX) => currentX === null || currentX !== windowConfig.x ? windowConfig.x : currentX);
            setLocalY((currentY) => currentY === null || currentY !== windowConfig.y ? windowConfig.y : currentY);
            setLocalWidth((currentWidth) => currentWidth === null || currentWidth !== windowConfig.width ? windowConfig.width : currentWidth);
            setLocalHeight((currentHeight) => currentHeight === null || currentHeight !== windowConfig.height ? windowConfig.height : currentHeight);
        });

        return () => window.cancelAnimationFrame(frameId);
    }, [windowConfig, isDragging, isResizing]);

    useEffect(() => {
        const id = window.setTimeout(() => setIsMounted(true), 10);
        return () => window.clearTimeout(id);
    }, []);

    // -------------------------------------------------------------------------
    // Derived Runtime Flags
    // -------------------------------------------------------------------------

    // Derive isHovered from live ref state
    // Keep a renderable `isHovered` derived from state so consumers re-render when hover changes

    const isLocked = windowConfig?.is_locked ?? false;
    const isResizeAble = windowConfig?.is_resizeable ?? true;
    const canCapturePointer = mouseFocusEnabled;
    const resolveWindowStateClass = useCallback((): string => {
        if (windowDisplayMode === 'all_visible') {
            return 'active';
        }

        if (windowDisplayMode === 'active_and_focused_only') {
            return (isFocused || isActive || isHovered || isDragging || isResizing) ? 'active' : '';
        }

        if (windowDisplayMode === 'all_semi_transparent') {
            return 'semi-transparent';
        }

        if (windowDisplayMode === 'all_transparent') {
            return 'transparent';
        }

        return 'active';
    }, [isActive, isDragging, isFocused, isHovered, isResizing, windowDisplayMode]);

    // -------------------------------------------------------------------------
    // Window Lifecycle Actions
    // -------------------------------------------------------------------------

    const focus = useCallback(() => {
        if (!windowConfig || !mouseFocusEnabled) return;
        WindowEngine.focusWindow(windowConfig.window_uid);
    }, [windowConfig, mouseFocusEnabled]);

    const close = useCallback(() => {
        WindowEngine.closeWindow(windowUid);
    }, [windowUid]);

    const minimize = useCallback(() => {
        WindowEngine.minimizeWindow(windowUid);
    }, [windowUid]);

    const toggleLock = useCallback(() => {
        if (!windowConfig) return;
        WindowEngine.updateWindowConfig(windowConfig.window_uid, { is_locked: !windowConfig.is_locked });
    }, [windowConfig]);

    const toggleAlwaysOnTop = useCallback(() => {
        if (!windowConfig) return;
        WindowEngine.updateWindowConfig(windowConfig.window_uid, { always_on_top: !windowConfig.always_on_top });
    }, [windowConfig]);

    const setOpacity = useCallback(
        (opacity: number) => {
            WindowEngine.updateWindowConfig(windowUid, { opacity });
        },
        [windowUid]
    );

    const updateConfig = useCallback(
        (partial: Partial<WindowConfig>) => {
            WindowEngine.updateWindowConfig(windowUid, partial);
        },
        [windowUid]
    );

    const updateBounds = useCallback(
        (x: number, y: number, width: number, height: number) => {
            WindowEngine.updateWindowBounds(windowUid, x, y, width, height);
        },
        [windowUid]
    );

    // -------------------------------------------------------------------------
    // Drag Orchestration (Pointer -> Transient Local State -> Commit)
    // -------------------------------------------------------------------------

    const beginDrag = useCallback(
        (event: DragStartEvent, startDrag?: () => void) => {
            if (!windowConfig || !canCapturePointer || windowConfig.is_locked) return;
            if ('button' in event && event.button !== 0) return;

            // Prevent multiple concurrent drag initiations which cause RAF loops to clash
            if (elementRef.current?.dataset.isDragging === 'true') return;

            event.preventDefault();
            event.stopPropagation();

            focus();
            startDrag?.();
        },
        [canCapturePointer, focus, windowConfig]
    );

    const beginResize = useCallback((direction: ResizeDirection, event: ResizeStartEvent) => {
        if (!windowConfig || !canCapturePointer || windowConfig.is_locked || !isResizeAble) return;
        if (event.button !== 0) return;
        if (elementRef.current?.dataset.isDragging === 'true' || elementRef.current?.dataset.isResizing === 'true') return;

        const startLeft = localX ?? windowConfig.x;
        const startTop = localY ?? windowConfig.y;
        const startWidth = localWidth ?? windowConfig.width;
        const startHeight = localHeight ?? windowConfig.height;

        event.preventDefault();
        event.stopPropagation();

        resizeSessionRef.current = {
            direction,
            startX: event.clientX,
            startY: event.clientY,
            startLeft,
            startTop,
            startWidth,
            startHeight,
        };

        setIsResizing(true);
        StateEngine.setPointerDown(true);
        focus();

        if (elementRef.current) {
            elementRef.current.dataset.isResizing = 'true';
        }
    }, [canCapturePointer, focus, isResizeAble, localHeight, localWidth, localX, localY, windowConfig]);

    const handleDragStart = useCallback(() => {
        if (!windowConfig) return;

        dragOriginRef.current = {
            x: localX ?? windowConfig.x,
            y: localY ?? windowConfig.y,
        };

        setIsDragging(true);
        StateEngine.setPointerDown(true);

        if (elementRef.current) {
            elementRef.current.dataset.isDragging = 'true';
        }
    }, [localX, localY, windowConfig]);

    const handleDrag = useCallback(() => {
        return;
    }, []);

    const handleDragEnd = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        if (!windowConfig) return;

        const nextX = Math.round(dragOriginRef.current.x + info.offset.x);
        const nextY = Math.round(dragOriginRef.current.y + info.offset.y);

        setLocalX(nextX);
        setLocalY(nextY);
        setIsDragging(false);
        StateEngine.setPointerDown(false);
        WindowEngine.updateWindowBounds(windowUid, nextX, nextY, windowConfig.width, windowConfig.height);

        if (elementRef.current) {
            delete elementRef.current.dataset.isDragging;
        }
    }, [windowConfig, windowUid]);

    const handlePointerEnter = useCallback(() => {
        setIsHovered(true);
        StateEngine.setActiveWindow(windowUid);
    }, [windowUid]);

    const handlePointerLeave = useCallback(() => {
        setIsHovered(false);
        if (StateEngine.readActiveWindow() === windowUid) {
            StateEngine.setActiveWindow(null);
        }
    }, [windowUid]);

    const dragHandleProps = useMemo<AceWindowRenderProps['dragHandleProps']>(() => ({
        onPointerDown: (event) => {
            beginDrag(event);
        },
    }), [beginDrag]);

    const getResizeHandleProps = useCallback<AceWindowRenderProps['getResizeHandleProps']>((direction) => ({
        onPointerDown: (event) => {
            beginResize(direction, event);
        },
    }), [beginResize]);

    const resizeHandleProps = useMemo<AceWindowRenderProps['resizeHandleProps']>(() => ({
        onPointerDown: (event) => {
            beginResize('se', event);
        },
    }), [beginResize]);

    useEffect(() => {
        if (!isResizing || !windowConfig) {
            return;
        }

        const computeNextBounds = (event: PointerEvent) => {
            const { direction, startX, startY, startLeft, startTop, startWidth, startHeight } = resizeSessionRef.current;
            const deltaX = event.clientX - startX;
            const deltaY = event.clientY - startY;
            const startRight = startLeft + startWidth;
            const startBottom = startTop + startHeight;

            let nextX = startLeft;
            let nextY = startTop;
            let nextWidth = startWidth;
            let nextHeight = startHeight;

            if (direction.includes('e')) {
                nextWidth = Math.max(MIN_WINDOW_WIDTH, Math.round(startWidth + deltaX));
            }

            if (direction.includes('s')) {
                nextHeight = Math.max(MIN_WINDOW_HEIGHT, Math.round(startHeight + deltaY));
            }

            if (direction.includes('w')) {
                nextX = Math.min(Math.round(startLeft + deltaX), startRight - MIN_WINDOW_WIDTH);
                nextWidth = Math.max(MIN_WINDOW_WIDTH, Math.round(startRight - nextX));
            }

            if (direction.includes('n')) {
                nextY = Math.min(Math.round(startTop + deltaY), startBottom - MIN_WINDOW_HEIGHT);
                nextHeight = Math.max(MIN_WINDOW_HEIGHT, Math.round(startBottom - nextY));
            }

            return { nextX, nextY, nextWidth, nextHeight };
        };

        const handlePointerMove = (event: PointerEvent) => {
            const { nextX, nextY, nextWidth, nextHeight } = computeNextBounds(event);

            setLocalX(nextX);
            setLocalY(nextY);
            setLocalWidth(nextWidth);
            setLocalHeight(nextHeight);
        };

        const handlePointerUp = (event: PointerEvent) => {
            const { nextX, nextY, nextWidth, nextHeight } = computeNextBounds(event);

            setLocalX(nextX);
            setLocalY(nextY);
            setLocalWidth(nextWidth);
            setLocalHeight(nextHeight);
            setIsResizing(false);
            StateEngine.setPointerDown(false);
            WindowEngine.updateWindowBounds(
                windowUid,
                nextX,
                nextY,
                nextWidth,
                nextHeight,
            );

            if (elementRef.current) {
                delete elementRef.current.dataset.isResizing;
            }
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp, { once: true });

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [isResizing, windowConfig, windowUid]);

    const position = useMemo(() => ({
        x: localX ?? windowConfig?.x ?? 0,
        y: localY ?? windowConfig?.y ?? 0,
    }), [localX, localY, windowConfig?.x, windowConfig?.y]);

    const size = useMemo(() => ({
        width: localWidth ?? windowConfig?.width ?? MIN_WINDOW_WIDTH,
        height: localHeight ?? windowConfig?.height ?? MIN_WINDOW_HEIGHT,
    }), [localHeight, localWidth, windowConfig?.height, windowConfig?.width]);

    // -------------------------------------------------------------------------
    // Headless Style Output
    // -------------------------------------------------------------------------

    // `rootStyle` only contains runtime-computed geometry and stack metadata.
    // Visual themes (background, border, shadow, shape) remain consumer-owned.
    const rootStyle = useMemo<CSSProperties>(() => {
        if (!windowConfig) {
            return { display: 'none' };
        }

        // PERF: We do NOT provide `transform` here anymore unless it's the very first render.
        // The `elementRef` effect handles positioning to avoid React fighting the drag RAF loop.
        if (windowConfig.is_minimized) {
            return {
                width: size.width,
                height: size.height,
                zIndex: -1,
                opacity: 0,
                visibility: 'hidden' as const,
                pointerEvents: 'none' as const,
                willChange: 'transform',
            };
        }

        return {
            width: size.width,
            height: size.height,
            zIndex: windowConfig.always_on_top ? 9999 + windowConfig.z_index : windowConfig.z_index,
            pointerEvents: canCapturePointer ? 'auto' as const : 'none' as const,
            willChange: 'transform',
        };
    }, [canCapturePointer, size.height, size.width, windowConfig]);

    // Sync windowConfig.opacity to DOM directly so changes don't require rootStyle to recompute.
    // Skip when not yet mounted (opacity-0 Tailwind class handles the hidden state) or minimized
    // (rootStyle's minimized branch owns opacity:0 there).
    useLayoutEffect(() => {
        const el = elementRef.current;
        if (!el || !windowConfig || !isMounted || windowConfig.is_minimized) return;
        el.style.opacity = String(windowConfig.opacity ?? 1);
    }, [isMounted, windowConfig, windowConfig?.opacity, windowConfig?.is_minimized]);


    // -------------------------------------------------------------------------
    // Public Hook Contract
    // -------------------------------------------------------------------------

    return {
        windowUid,
        windowConfig,
        dragHandleProps,
        resizeHandleProps,
        getResizeHandleProps,
        rootStyle,
        position,
        size,
        animationState,
        
        isFocused,
        isActive,
        isHovered,
        isDragging,
        isResizing,
        isMounted,
        isResizeAble,
        isLocked,
        canCapturePointer,
        resolveWindowStateClass,

        focus,
        close,
        minimize,
        toggleLock,
        toggleAlwaysOnTop,

        setOpacity,
        updateConfig,
        updateBounds,
        beginDrag,
        beginResize,
        handleDragStart,
        handleDrag,
        handleDragEnd,
        handlePointerEnter,
        handlePointerLeave,
        ref: elementRef,
    };
}
