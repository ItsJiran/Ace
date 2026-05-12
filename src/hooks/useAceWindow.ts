import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react';
import type { WindowConfig } from '#/schemas/window';
import { WindowEngine } from '#/services/windowEngine';
import { KernelEngine } from '#/services/kernelEngine';
import { GlobalStateManager } from '#/services/globalStateManager';
import { useAceMemory, useAceMemorySelector } from '#/hooks/useAceMemory';

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
export function useAceWindow(window_uid : string): any {
    // -------------------------------------------------------------------------
    // Runtime Memory Subscriptions
    // -------------------------------------------------------------------------

    // Resolve runtime identity.
    const windowUid = window_uid;
    const windowConfig = useAceMemory<WindowConfig>(`system:window:${windowUid}`); // contoning current global window state

    // OPTIMIZATION: Removed global animation subscription (`system:window_animations`).
    // Previously, every AceWindow re-rendered whenever ANY window animated.
    // We now fetch animation state on-demand during interactions, or rely on specific visual keys if needed.
    const mouseFocusEnabled = useAceMemory<boolean>('system:global_state:mouse_focus_enabled') ?? true;

    // -------------------------------------------------------------------------
    const elementRef = useRef<HTMLDivElement | null>(null);

    // -------------------------------------------------------------------------
    // Local Interaction State (transient, high-frequency)
    // -------------------------------------------------------------------------

    const [isMounted, setIsMounted] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const isFocused = useAceMemorySelector<string | null, boolean>(
        'system:global_state:focused_window',
        (focusedUid) => focusedUid === windowUid
    );

    // ARCHITECTURE: Window position is LOCAL state, not subscribed from global
    // This completely isolates position updates from global cascades.
    // Initialize once from config, then manage locally during interactions.
    // Only commit to global on drag-end.
    const [localX, setLocalX] = useState<number | null>(null);
    const [localY, setLocalY] = useState<number | null>(null);

    // Initialize local position when config first becomes available.
    // Important: config for string input may arrive AFTER mount from RAM sync.
    useEffect(() => {
        
        if (windowConfig && localX === null && localY === null) {
            setLocalX(windowConfig.x);
            setLocalY(windowConfig.y);
        }

    }, [windowConfig, localX, localY]);

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
    const windowStyle = windowConfig?.window_style ?? 'standard';
    const canCapturePointer = mouseFocusEnabled;

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
        (e: ReactMouseEvent<HTMLElement>) => {
            if (!windowConfig || !canCapturePointer || windowConfig.is_locked) return;
            if (e.button !== 0) return;

            // Prevent multiple concurrent drag initiations which cause RAF loops to clash
            if (elementRef.current?.dataset.isDragging === 'true') return;

            e.preventDefault();
            e.stopPropagation();

            // SKIP: focus() already called in rootProps.onMouseDown above this
            // Avoid double-firing storage updates during drag initiation
            GlobalStateManager.setPointerDown(true);

            if (elementRef.current) {
                elementRef.current.dataset.isDragging = 'true';
            }

            // future implementation
            const elementId = `window-${windowConfig.window_uid}`;

            const updatePosition = () => {
                // NOW (at drag-end only) commit to global store
                // WindowEngine.updateWindowBounds(
                //     windowConfig.window_uid,
                //     Math.round(targetX),
                //     Math.round(targetY),
                //     windowConfig.width,
                //     windowConfig.height
                // );

                // IMPORTANT: Only return control to React AFTER commit is done.
                // setIsDragging(false);                
            };

            // Ref used to communicate dragging state inside RAF loop
            const isDraggingRef = { current: true };

            const onMouseMove = (moveEvent: MouseEvent) => {

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
        [canCapturePointer, windowConfig, focus, localX, localY]
    );

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
                width: windowConfig.width,
                height: windowConfig.height,
                zIndex: -1,
                opacity: 0,
                visibility: 'hidden' as const,
                pointerEvents: 'none' as const,
                willChange: 'transform',
            };
        }

        return {
            width: windowConfig.width,
            height: windowConfig.height,
            zIndex: windowConfig.always_on_top ? 9999 + windowConfig.z_index : windowConfig.z_index,
            willChange: 'transform',
        };
    }, [windowConfig]);

    // Sync windowConfig.opacity to DOM directly so changes don't require rootStyle to recompute.
    // Skip when not yet mounted (opacity-0 Tailwind class handles the hidden state) or minimized
    // (rootStyle's minimized branch owns opacity:0 there).
    useLayoutEffect(() => {
        const el = elementRef.current;
        if (!el || !windowConfig || !isMounted || windowConfig.is_minimized) return;
        el.style.opacity = String(windowConfig.opacity ?? 1);
    }, [isMounted, windowConfig?.opacity, windowConfig?.is_minimized]);


    // -------------------------------------------------------------------------
    // Public Hook Contract
    // -------------------------------------------------------------------------

    return {
        windowUid,
        windowConfig,
        rootStyle,
        
        isFocused,
        isHovered,
        isDragging,
        isMounted,
        canCapturePointer,

        focus,
        close,
        minimize,
        toggleLock,
        toggleAlwaysOnTop,

        setOpacity,
        updateConfig,
        updateBounds,
        ref: elementRef,
    };
}
