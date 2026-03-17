import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { BaseWindow } from './components/layout/BaseWindow';
import { useAceMemory } from '#/hooks/useAceMemory';
import type { GlobalOverlayState, WindowConfig } from '#/schemas/window';
import { Storage as StorageEngine } from '#/services/storageEngine';
import { WindowEngine } from '#/services/windowEngine';
import { GlobalStateManager } from '#/services/globalStateManager';

const DevFPSCounter = import.meta.env.DEV
  ? lazy(async () => {
      const mod = await import('#/core/packages/system-dev/components/FPSCounter');
      return { default: mod.FPSCounter };
    })
  : null;


function App() {
  const [isBootReady, setIsBootReady] = useState(false);
  const pointerRafRef = useRef<number | null>(null);
  const pendingPointerRef = useRef<{ x: number; y: number } | null>(null);

  // 🚀 ACE BOOTUP: Trigger the ordered runtime boot sequence on mount
  useEffect(() => {
    import('./boot').then(({ bootACE }) => {
      bootACE().then(() => {
        setIsBootReady(true);
      }).catch(() => {
        setIsBootReady(false);
      });
    });
  }, []);

  // Listen for the 'Escape' key to globally panic back to Ambient Mode if stuck
  useEffect(() => {
    if (!isBootReady) return;

    let initialized = false;

    GlobalStateManager.setPointerInside(true);
    GlobalStateManager.setActiveElement(document.activeElement);

    // Spawn developer console once on mount in Dev
    if (import.meta.env.DEV && !initialized) {
      initialized = true;
      // Just check if there's already any windows to prevent StrictMode double spawning
      const windows = StorageEngine.readMemory('system:windows');
      if (Object.keys(windows || {}).length === 0) {
        WindowEngine.spawnWindow({
          component_name: 'dev_menu',
          x: Math.floor(window.innerWidth / 2 - 170),
          y: Math.floor(window.innerHeight / 2 - 230),
          width: 340,
          height: 460,
          title: 'Dev Kit'
        });
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        WindowEngine.setOverlayMode('ambient');
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      pendingPointerRef.current = { x: e.clientX, y: e.clientY };

      // Cap pointer updates to one write per animation frame.
      if (pointerRafRef.current !== null) return;

      pointerRafRef.current = window.requestAnimationFrame(() => {
        pointerRafRef.current = null;
        const pending = pendingPointerRef.current;
        if (!pending) return;

        GlobalStateManager.setCursorPosition(pending.x, pending.y);
        GlobalStateManager.setPointerInside(true);
      });
    };

    const handlePointerDown = () => {
      GlobalStateManager.setPointerDown(true);
      GlobalStateManager.setActiveElement(document.activeElement);
    };

    const handlePointerUp = () => {
      GlobalStateManager.setPointerDown(false);
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const handleFocusIn = (e: FocusEvent) => {
      GlobalStateManager.setPointerInside(true);
      GlobalStateManager.setActiveElement((e.target as Element) ?? document.activeElement);
    };

    const handleWindowBlur = () => {
      GlobalStateManager.setPointerInside(false);
      GlobalStateManager.setPointerDown(false);
    };

    const handleWindowFocus = () => {
      GlobalStateManager.setPointerInside(true);
      GlobalStateManager.setActiveElement(document.activeElement);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('contextmenu', handleContextMenu, { capture: true });
    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      if (pointerRafRef.current !== null) {
        window.cancelAnimationFrame(pointerRafRef.current);
        pointerRafRef.current = null;
      }

      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('contextmenu', handleContextMenu, { capture: true });
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [isBootReady]);

  // 1. O(1) Hooks watching the global WindowEngine Maps
  const overlayState = useAceMemory<GlobalOverlayState>('system:overlay_state');
  const windows = useAceMemory<Record<string, WindowConfig>>('system:windows');
  if (!isBootReady || !overlayState || !windows) return null;

  const isAmbient = overlayState.mode === 'ambient';

  return (
    // 🚀 THE MAGIC WRAPPER
    // Di Tauri, bg-transparent biasanya cukup, tapi 0.005 tetap aman digunakan
    <div
      className="absolute inset-0 w-screen h-screen overflow-hidden pointer-events-none"
      onContextMenu={(e) => e.preventDefault()}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.005)' }}
    >
      {/* Render semua window */}
      {Object.values(windows).map(config => (
        <BaseWindow key={config.window_uid} config={config} />
      ))}

      {import.meta.env.DEV && DevFPSCounter ? (
        <Suspense fallback={null}>
          <DevFPSCounter />
        </Suspense>
      ) : null}

      {/* Developer Feedback UI */}
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