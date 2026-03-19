import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import type { WindowConfig } from '#/schemas/window';
import type { AnimationRuntimeState, AnimationSequence, BoundsAnchor } from '#/schemas/animation';
import { WindowEngine } from '#/services/windowEngine';
import { StorageEngine } from '#/services/storageEngine';
import { GlobalStateManager } from '#/services/globalStateManager';
import { useAceMemory } from '#/hooks/useAceMemory';

// -----------------------------------------------------------------------------
// Hook Contract Types
// -----------------------------------------------------------------------------

type ContextMenuPosition = { x: number; y: number };

// The hook accepts either a full WindowConfig (when parent already has it)
// or a window_uid string (when child only knows runtime identity).
type UseAceWindowInput = WindowConfig | string;

type DragHandleProps = {
    onMouseDown: (e: ReactMouseEvent<HTMLElement>) => void;
};

type RootProps = {
    id: string;
    onMouseDown: (e: ReactMouseEvent<HTMLDivElement>) => void;
    onContextMenu: (e: ReactMouseEvent<HTMLDivElement>) => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
};

export type UseAceWindowResult = {
    windowUid: string;
    config?: WindowConfig;
    rootStyle: CSSProperties;
    rootProps: RootProps;
    dragHandleProps: DragHandleProps;
    animationState?: AnimationRuntimeState;
    chromeStyle: 'standard' | 'borderless';
    dragSurface: 'header' | 'full';
    isBorderless: boolean;
    isFullDrag: boolean;
    isFocused: boolean;
    isLocked: boolean;
    isDragging: boolean;
    isMounted: boolean;
    hideRing: boolean;
    canCapturePointer: boolean;
    contextMenu: ContextMenuPosition | null;
    closeContextMenu: () => void;
    openContextMenu: (x: number, y: number) => void;
    focus: () => void;
    close: () => void;
    toggleLock: () => void;
    toggleAlwaysOnTop: () => void;
    setOpacity: (opacity: number) => void;
    updateConfig: (partial: Partial<WindowConfig>) => void;
    updateBounds: (x: number, y: number, width: number, height: number) => void;
    playAnimation: (sequence: AnimationSequence) => void;
    cancelAnimation: () => void;
    retargetAnimation: (to: BoundsAnchor) => void;
    isAnimationLocked: boolean;
};

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
export function useAceWindow(input: UseAceWindowInput): UseAceWindowResult {
    // -------------------------------------------------------------------------
    // Runtime Memory Subscriptions
    // -------------------------------------------------------------------------

    const windows = useAceMemory<Record<string, WindowConfig>>('system:windows');
    const allAnimStates = useAceMemory<Record<string, AnimationRuntimeState>>('system:window_animations');
    const mouseFocusEnabled = useAceMemory<boolean>('system:mouse_focus_enabled') ?? true;

    // Resolve runtime identity and config source.
    // If caller passed only uid, config is read from `system:windows`.
    const windowUid = typeof input === 'string' ? input : input.window_uid;
    const config = typeof input === 'string' ? windows?.[input] : input;

    // -------------------------------------------------------------------------
    // Local Interaction State (transient, high-frequency)
    // -------------------------------------------------------------------------

    const [isMounted, setIsMounted] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null);
    const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
    const dragPositionRef = useRef<{ x: number; y: number } | null>(null);

    useEffect(() => {
        const id = window.setTimeout(() => setIsMounted(true), 10);
        return () => window.clearTimeout(id);
    }, []);

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

    // -------------------------------------------------------------------------
    // Derived Runtime Flags
    // -------------------------------------------------------------------------

    const animationState = allAnimStates?.[windowUid];
    const isAnimationLocked = Boolean(animationState?.is_running && animationState?.interrupt_policy === 'lock');

    const isFocused = config?.is_focused ?? false;
    const isLocked = config?.is_locked ?? false;
    const chromeStyle = config?.chrome_style ?? 'standard';
    const dragSurface = config?.drag_surface ?? 'header';
    const isBorderless = chromeStyle === 'borderless';
    const isFullDrag = dragSurface === 'full';
    const hideRing = config?.hide_ring ?? false;
    const canCapturePointer = mouseFocusEnabled;

    // -------------------------------------------------------------------------
    // Window Lifecycle Actions
    // -------------------------------------------------------------------------

    const focus = useCallback(() => {
        if (!config || !mouseFocusEnabled) return;
        WindowEngine.focusWindow(config.window_uid);
    }, [config, mouseFocusEnabled]);

    const close = useCallback(() => {
        WindowEngine.closeWindow(windowUid);
    }, [windowUid]);

    const toggleLock = useCallback(() => {
        if (!config) return;
        WindowEngine.updateWindowConfig(config.window_uid, { is_locked: !config.is_locked });
    }, [config]);

    const toggleAlwaysOnTop = useCallback(() => {
        if (!config) return;
        WindowEngine.updateWindowConfig(config.window_uid, { always_on_top: !config.always_on_top });
    }, [config]);

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
    // Animation Bridge Actions
    // -------------------------------------------------------------------------

    const playAnimation = useCallback(
        (sequence: AnimationSequence) => {
            WindowEngine.playAnimation(windowUid, sequence);
        },
        [windowUid]
    );

    const cancelAnimation = useCallback(() => {
        WindowEngine.cancelAnimation(windowUid);
    }, [windowUid]);

    const retargetAnimation = useCallback(
        (to: BoundsAnchor) => {
            WindowEngine.retargetAnimation(windowUid, to);
        },
        [windowUid]
    );

    // -------------------------------------------------------------------------
    // Drag Orchestration (Pointer -> Transient Local State -> Commit)
    // -------------------------------------------------------------------------

    const beginDrag = useCallback(
        (e: ReactMouseEvent<HTMLElement>) => {
            if (!config || !canCapturePointer || config.is_locked) return;
            if (e.button !== 0) return;

            const allAnimations = StorageEngine.readMemory('system:window_animations') as Record<string, AnimationRuntimeState> | undefined;
            const animState = allAnimations?.[config.window_uid];
            const interruptPolicy = animState?.is_running
                ? (animState.interrupt_policy as 'lock' | 'retarget' | 'cancel' | undefined)
                : undefined;

            if (interruptPolicy === 'lock') {
                return;
            }

            if (interruptPolicy === 'cancel') {
                WindowEngine.cancelAnimation(config.window_uid);
            }

            e.preventDefault();
            e.stopPropagation();

            focus();
            GlobalStateManager.setPointerDown(true);

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

                // For `retarget` policy we keep animation alive and move target.
                if (interruptPolicy === 'retarget') {
                    WindowEngine.retargetAnimation(config.window_uid, {
                        x: nextX,
                        y: nextY,
                        width: config.width,
                        height: config.height,
                    });
                }

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
                GlobalStateManager.setPointerDown(false);
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
            };

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        },
        [canCapturePointer, config, focus]
    );

    // -------------------------------------------------------------------------
    // Headless Style Output
    // -------------------------------------------------------------------------

    // `rootStyle` only contains runtime-computed geometry and stack metadata.
    // Visual themes (background, border, shadow, shape) remain consumer-owned.
    const rootStyle = useMemo<CSSProperties>(() => {
        if (!config) {
            return { transform: 'translate3d(0px, 0px, 0)' };
        }

        return {
            transform: `translate3d(${dragPosition?.x ?? config.x}px, ${dragPosition?.y ?? config.y}px, 0)`,
            width: config.width,
            height: config.height,
            zIndex: config.always_on_top ? 9999 + config.z_index : config.z_index,
            opacity: config.opacity ?? 1,
            willChange: 'transform',
        };
    }, [config, dragPosition?.x, dragPosition?.y]);

    // -------------------------------------------------------------------------
    // Headless Event Bindings
    // -------------------------------------------------------------------------

    // Bind to the outer shell/root element of a custom window implementation.
    const rootProps: RootProps = useMemo(
        () => ({
            id: `window-${windowUid}`,
            onMouseDown: (e: ReactMouseEvent<HTMLDivElement>) => {
                focus();
                if (!isFullDrag) return;

                const target = e.target as HTMLElement | null;
                if (target?.closest('[data-window-action="true"]')) return;

                beginDrag(e as unknown as ReactMouseEvent<HTMLElement>);
            },
            onContextMenu: (e: ReactMouseEvent<HTMLDivElement>) => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({ x: e.clientX, y: e.clientY });
            },
            onMouseEnter: () => WindowEngine.enterWindowSurface(windowUid),
            onMouseLeave: () => WindowEngine.leaveWindowSurface(windowUid),
        }),
        [beginDrag, focus, isFullDrag, windowUid]
    );

    // Bind to a dedicated drag-handle region if the component uses header drag.
    const dragHandleProps: DragHandleProps = useMemo(
        () => ({
            onMouseDown: (e: ReactMouseEvent<HTMLElement>) => {
                if (isFullDrag) return;
                beginDrag(e);
            },
        }),
        [beginDrag, isFullDrag]
    );

    // -------------------------------------------------------------------------
    // Public Hook Contract
    // -------------------------------------------------------------------------

    return {
        windowUid,
        config,
        rootStyle,
        rootProps,
        dragHandleProps,
        animationState,
        chromeStyle,
        dragSurface,
        isBorderless,
        isFullDrag,
        isFocused,
        isLocked,
        isDragging,
        isMounted,
        hideRing,
        canCapturePointer,
        contextMenu,
        closeContextMenu: () => setContextMenu(null),
        openContextMenu: (x: number, y: number) => setContextMenu({ x, y }),
        focus,
        close,
        toggleLock,
        toggleAlwaysOnTop,
        setOpacity,
        updateConfig,
        updateBounds,
        playAnimation,
        cancelAnimation,
        retargetAnimation,
        isAnimationLocked,
    };
}
