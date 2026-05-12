import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAceMemory } from "#/hooks/useAceMemory";
import { ProcessContextProvider } from "#/hooks/useProcessContext";
import { WindowContextProvider } from "#/hooks/useWindowContext";
import type { DesktopState } from "#/schemas/globalState";
import { useRenderCount } from "#/hooks/useRenderCount";
import { MemoizedWindowItem } from "#/components/layout/MemoizedWindowItem";
import type { KernelWindowEntry } from "#/services/kernelEngine/types";
import { GlobalStateManager } from "#/services/globalStateManager";

function App() {
  const [isBootReady, setIsBootReady] = useState(false);
  const renderCount = useRenderCount("GlobalOverlay");

  // 🚀 ACE BOOTUP: Trigger the ordered runtime boot sequence on mount
  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const { bootACE } = await import("./boot");
        await bootACE();
        if (isMounted) {
          setIsBootReady(true);
        }
      } catch (error) {
        if (isMounted) {
          setIsBootReady(false);
        }
        console.error("[App] bootACE failed:", error);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isBootReady || typeof window === "undefined" || !window.electronAPI?.onMouseTracking) {
      return;
    }

    const unsubscribe = window.electronAPI.onMouseTracking(({ x, y, isInsideApp }) => {
      GlobalStateManager.setCursorPosition(x, y);
      GlobalStateManager.setPointerInside(isInsideApp);
      console.log(`[Mouse Tracking] x: ${x}, y: ${y}, isInsideApp: ${isInsideApp}`);
    });

    return () => {
      unsubscribe();
      GlobalStateManager.setPointerInside(false);
    };
  }, [isBootReady]);

  // 1. O(1) Hooks watching the global WindowEngine Maps
  const overlayState = useAceMemory<DesktopState>(
    "system:global_state:desktop",
  );
  const windowSystem = useAceMemory<Map<string, KernelWindowEntry>>(
    "system:window_system",
  );

  const renderedWindowNodes = useMemo(() => {
    const nodes: ReactNode[] = [];
    if (!windowSystem) return nodes;

    for (const entry of windowSystem.values()) {
      nodes.push(
        <ProcessContextProvider
          key={entry.window_uid}
          process_uid={entry.process_uid}
        >
          <WindowContextProvider
            window_uid={entry.window_uid}
            process_uid={entry.process_uid}
          >
            <MemoizedWindowItem
              uid={entry.window_uid}
              component={entry.component}
            />
          </WindowContextProvider>
        </ProcessContextProvider>,
      );
    }
    return nodes;
  }, [windowSystem]);

  if (!isBootReady || !overlayState) return null;
  const isAmbient = overlayState.mode === "ambient";

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      style={{
        width: "100vw",
        height: "100vh",
        background: "transparent",
        position: "relative",
        pointerEvents: "none",
      }}
    >
      {/* Render semua window */}
      {renderedWindowNodes}

      {/* Developer Feedback UI */}
      {import.meta.env.DEV && (
        <div className="fixed bottom-1 left-1 bg-black/50 text-white text-[10px] pointer-events-none z-[9999] px-2 py-1 rounded">
          Global Overlay Renders: {renderCount}
        </div>
      )}

      {overlayState.is_overlay_locked && (
        <div className="absolute top-2 left-2 text-xs text-amber-400 font-mono pointer-events-none bg-black/50 px-2 py-1 rounded z-[99999] border border-amber-500/50">
          [LOCKED INTERACTIVE] F9 to unlock.
        </div>
      )}

      {isAmbient ? (
        <div className="absolute top-2 left-2 text-xs text-zinc-600 font-mono pointer-events-none">
          [Ambient Mode] Click-Through enabled.
        </div>
      ) : (
        <div className="absolute top-2 left-2 text-xs text-blue-400 font-mono pointer-events-none bg-black/50 px-2 py-1 rounded z-50">
          [Interactive Mode] Capturing mouse. Hit ESC to release.
        </div>
      )}
    </div>
  );
}

export default App;
