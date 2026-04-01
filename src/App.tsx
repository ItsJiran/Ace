import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAceMemory } from '#/hooks/useAceMemory';
import { useProcessContext } from '#/hooks/useProcessContext';
import { ProcessContextProvider } from '#/hooks/useProcessContext';
import { WindowContextProvider } from '#/hooks/useWindowContext';
import { initializeBridgeHooks, registerProcessContextHook } from '#/services/bridgeHooks';
import type { GlobalOverlayState } from '#/schemas/window';
import { useRenderCount } from '#/hooks/useRenderCount';
import { MemoizedWindowItem } from '#/components/layout/MemoizedWindowItem';
import type { KernelWindowEntry } from '#/services/kernelEngine/types';

function App() {
  const [isBootReady, setIsBootReady] = useState(false);
  const renderCount = useRenderCount('GlobalOverlay');

  // 🚀 ACE BOOTUP: Trigger the ordered runtime boot sequence on mount
  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const { bootACE } = await import('./boot');
        await bootACE();
        if (isMounted) {
          setIsBootReady(true);
        }
      } catch (error) {
        if (isMounted) {
          setIsBootReady(false);
        }
        console.error('[App] bootACE failed:', error);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // [Phase E] Initialize bridge hooks after React mounts
  // This allows external packages to access React hooks via window.ACE.hooks
  useEffect(() => {
    if (isBootReady) {
      initializeBridgeHooks();
      registerProcessContextHook(useProcessContext);
    }
  }, [isBootReady]);

  // 1. O(1) Hooks watching the global WindowEngine Maps
  const overlayState = useAceMemory<GlobalOverlayState>('system:overlay_state');
  const windowSystem = useAceMemory<Map<string, KernelWindowEntry>>('system:window_system');

  const renderedWindowNodes = useMemo(() => {
    const nodes: ReactNode[] = [];
    if (!windowSystem) return nodes;

    for (const entry of windowSystem.values()) {
      nodes.push(
        <ProcessContextProvider key={entry.window_uid} process_uid={entry.process_uid}>
          <WindowContextProvider window_uid={entry.window_uid} process_uid={entry.process_uid}>
            <MemoizedWindowItem uid={entry.window_uid} component={entry.component} />
          </WindowContextProvider>
        </ProcessContextProvider>,
      );
    }

    return nodes;
  }, [windowSystem]);


  if (!isBootReady || !overlayState) return null;
  const isAmbient = overlayState.mode === 'ambient';

  return (
    // 🚀 THE MAGIC WRAPPER
    // Di Tauri, bg-transparent biasanya cukup, tapi 0.005 tetap aman digunakan
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
