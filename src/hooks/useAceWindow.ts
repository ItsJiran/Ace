import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
    ref: React.RefObject<HTMLDivElement>;
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

    // Resolve runtime identity.
    const windowUid = typeof input === 'string' ? input : input.window_uid;

    // Granular Subscription: Listen only to this specific window's config
    const memConfig = useAceMemory<WindowConfig>(`system:window:${windowUid}`);
    
    // Fallback: If input was a full object (initial prop from parent), use it until RAM syncs
    // though ideally we rely on the RAM subscription for updates.
    const config = memConfig || (typeof input !== 'string' ? input : undefined);

    // OPTIMIZATION: Removed global animation subscription (`system:window_animations`).
    // Previously, every AceWindow re-rendered whenever ANY window animated.
    // We now fetch animation state on-demand during interactions, or rely on specific visual keys if needed.
    const mouseFocusEnabled = useAceMemory<boolean>('system:mouse_focus_enabled') ?? true;

    // -------------------------------------------------------------------------
    // Local Interaction State (transient, high-frequency)
    // -------------------------------------------------------------------------

    const [isMounted, setIsMounted] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(null);
    const dragPositionRef = useRef<{ x: number; y: number } | null>(null);
    const elementRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const id = window.setTimeout(() => setIsMounted(true), 10);
        return () => window.clearTimeout(id);
    }, []);

    // SYNC position from config to DOM when NOT dragging
    // This allows React/Store updates to move the window, but lets RAF loop take over during drag.
    useLayoutEffect(() => {
        if (!elementRef.current || !config || isDragging) return;
        
        // Direct DOM write to avoid React render cycle for position
        elementRef.current.style.transform = `translate3d(${config.x}px, ${config.y}px, 0)`;
        
        // Also update transparency/z-index here if needed, or leave those to React style prop?
        // Let's leave static props to React, only transform is hot.
    }, [config?.x, config?.y, isDragging]);

    useEffect(() => {
        const closeMenu = () => setContextMenu(null);
        if (contextMenu) {
            window.addEventListener('click', closeMenu);
        }

        return () => window.removeEventListener('click', closeMenu);
    }, [contextMenu]);

    useEffect(() => {
        if (!isDragging) {
            dragPositionRef.current = null;
        }
    }, [isDragging]);

    // -------------------------------------------------------------------------
    // Derived Runtime Flags
    // -------------------------------------------------------------------------
    
    // We no longer have real-time access to animation state via hooks to prevent re-renders.
    // If a component needs to visually react to animation state, it should subscribe to a specific key.
    const animationState: AnimationRuntimeState | undefined = undefined; 
    const isAnimationLocked = false; // Simplified; we check this imperatively during interactions now.

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
            let currentX = initialX;
            let currentY = initialY;
            let targetX = initialX;
            let targetY = initialY;
            
            // Physics State (Spring Simulation)
            let vx = 0;
            let vy = 0;
            // Configuration for "Organic" feel (Framer-like Spring)
            const tension = 320; // Stiffness (higher = snappier)
            const friction = 28; // Damping (higher = less oscillation)
            const precision = 0.05; // Stop when closer than this
            
            // Time step
            let lastTime = performance.now();
            const elementId = `window-${config.window_uid}`;

            const updatePhysics = (timestamp: number) => {
                const dt = Math.min((timestamp - lastTime) / 1000, 0.064); // Cap at ~15fps drop
                lastTime = timestamp;

                // Hooke's Law: F = -k*x - c*v
                const ax = (targetX - currentX) * tension - vx * friction;
                const ay = (targetY - currentY) * tension - vy * friction;

                vx += ax * dt;
                vy += ay * dt;

                currentX += vx * dt;
                currentY += vy * dt;

                // Apply transform
                const el = elementRef.current || document.getElementById(elementId);
                if (el) {
                    el.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
                }
                
                // Track for commit
                dragPositionRef.current = { x: currentX, y: currentY };

                // Continue loop if not settled
                const settled = Math.abs(vx) < precision && Math.abs(vy) < precision && 
                               Math.abs(targetX - currentX) < precision && 
                               Math.abs(targetY - currentY) < precision;
                
                if (!settled || isDraggingRef.current) {
                    rafId = window.requestAnimationFrame(updatePhysics);
                } else {
                    // Final snap and cleanup
                    rafId = null;
                    if (el) {
                        el.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
                    }
                    // Commit to store if we haven't already
                    WindowEngine.updateWindowBounds(
                        config.window_uid,
                        targetX,
                        targetY,
                        config.width,
                        config.height
                    );
                    
                    // IMPORTANT: Only return control to React AFTER commit is done.
                    setIsDragging(false);
                }
            };
            
            // Ref used to communicate dragging state inside RAF loop
            const isDraggingRef = { current: true };

            // Start loop immediately to catch the "click-without-drag" case
            if (rafId === null) {
                lastTime = performance.now();
                rafId = window.requestAnimationFrame(updatePhysics);
            }

            const onMouseMove = (moveEvent: MouseEvent) => {
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;
                
                // Update the TARGET, not the current position directly.
                // The physics loop will chase this target.
                targetX = initialX + dx;
                targetY = initialY + dy;

                if (rafId === null) {
                    lastTime = performance.now();
                    rafId = window.requestAnimationFrame(updatePhysics);
                }

                // For `retarget` policy we keep animation alive and move target.
                if (interruptPolicy === 'retarget') {
                    WindowEngine.retargetAnimation(config.window_uid, {
                        x: targetX,
                        y: targetY,
                        width: config.width,
                        height: config.height,
                    });
                }
            };

            const onMouseUp = () => {
                isDraggingRef.current = false; // Signal loop to check for settling
                // IMPORTANT: Do NOT setIsDragging(false) here. 
                // Let the physics loop 'settle' first, then cleanup.
                GlobalStateManager.setPointerDown(false);
                
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
                
                // Note: We do NOT cancel RAF here. 
                // We let the physics loop run until settled (inertial slide / spring settle).
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
            return { display: 'none' };
        }

        // PERF: We do NOT provide `transform` here anymore unless it's the very first render.
        // The `elementRef` effect handles positioning to avoid React fighting the drag RAF loop.
        return {
            width: config.width,
            height: config.height,
            zIndex: config.always_on_top ? 9999 + config.z_index : config.z_index,
            opacity: config.opacity ?? 1,
            willChange: 'transform',
        };
    }, [config]);

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
        ref: elementRef,
    };
}
