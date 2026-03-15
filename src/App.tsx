import { useEffect, useState } from 'react';
import { BaseWindow } from './components/layout/BaseWindow';
import { useAceMemory } from '#/hooks/useAceMemory';
import type { GlobalOverlayState, WindowConfig } from '#/schemas/window';
import { Storage } from '#/services/storageEngine';


function App() {
  const [, setLocalBoxPos] = useState({ x: 200, y: 360 });
  const [isBootReady, setIsBootReady] = useState(false);

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

    // Expose local state setter to window for DevMenu to trigger
    (window as any).moveLocalBox = () => {
      setLocalBoxPos(prev => ({ ...prev, x: prev.x + 50 }));
    };

    let initialized = false;

    // Technically this should be IPC to electron/Tauri, but for the React dev layer:
    import('./services/windowEngine').then(({ WindowEngine }) => {
      import('./services/globalStateManager').then(({ GlobalStateManager }) => {
        GlobalStateManager.setPointerInside(true);
        GlobalStateManager.setActiveElement(document.activeElement);
      });

      // Spawn developer console once on mount in Dev
      if (import.meta.env.DEV && !initialized) {
        initialized = true;
        // Just check if there's already any windows to prevent StrictMode double spawning
        const windows = Storage.readMemory('system:windows');
        if (Object.keys(windows || {}).length === 0) {
          WindowEngine.spawnWindow({
            component_name: 'dev_menu',
            x: Math.floor(window.innerWidth / 2 - 130),
            y: Math.floor(window.innerHeight / 2 - 155),
            width: 260,
            height: 310,
            title: 'Dev Kit'
          });
        }
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        import('./services/windowEngine').then(({ WindowEngine }) => {
          WindowEngine.setOverlayMode('ambient');
        });
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      import('./services/globalStateManager').then(({ GlobalStateManager }) => {
        GlobalStateManager.setCursorPosition(e.clientX, e.clientY);
        GlobalStateManager.setPointerInside(true);
      });
    };

    const handlePointerDown = () => {
      import('./services/globalStateManager').then(({ GlobalStateManager }) => {
        GlobalStateManager.setPointerDown(true);
        GlobalStateManager.setActiveElement(document.activeElement);
      });
    };

    const handlePointerUp = () => {
      import('./services/globalStateManager').then(({ GlobalStateManager }) => {
        GlobalStateManager.setPointerDown(false);
      });
    };

    const handleFocusIn = (e: FocusEvent) => {
      import('./services/globalStateManager').then(({ GlobalStateManager }) => {
        GlobalStateManager.setPointerInside(true);
        GlobalStateManager.setActiveElement((e.target as Element) ?? document.activeElement);
      });
    };

    const handleWindowBlur = () => {
      import('./services/globalStateManager').then(({ GlobalStateManager }) => {
        GlobalStateManager.setPointerInside(false);
        GlobalStateManager.setPointerDown(false);
      });
    };

    const handleWindowFocus = () => {
      import('./services/globalStateManager').then(({ GlobalStateManager }) => {
        GlobalStateManager.setPointerInside(true);
        GlobalStateManager.setActiveElement(document.activeElement);
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      delete (window as any).moveLocalBox;
    };
  }, [isBootReady]);

  // 1. O(1) Hooks watching the global WindowEngine Maps
  const overlayState = useAceMemory<GlobalOverlayState>('system:overlay_state');
  const windows = useAceMemory<Record<string, WindowConfig>>('system:windows');
  const debugPos = useAceMemory<{ x: number, y: number }>('debug:box_pos');

  if (!isBootReady || !overlayState || !windows) return null;

  const isAmbient = overlayState.mode === 'ambient';

  return (
    // 🚀 THE MAGIC WRAPPER
    // Di Tauri, bg-transparent biasanya cukup, tapi 0.005 tetap aman digunakan
    <div
      className="absolute inset-0 w-screen h-screen overflow-hidden pointer-events-none"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.005)' }}
    >
      {/* Render semua window */}
      {Object.values(windows).map(config => (
        <BaseWindow key={config.window_uid} config={config} />
      ))}

      {/* Pure Redraw Debug Box (Global RAM/useSyncExternalStore) */}
      {debugPos && (
        <div
          className="absolute w-32 h-32 bg-red-500 rounded-xl shadow-2xl transition-transform duration-200 flex items-center justify-center text-white text-xs font-bold text-center pointer-events-auto"
          style={{ transform: `translate3d(${debugPos.x}px, ${debugPos.y}px, 0)` }}
        >
          Global RAM<br />(RED)
        </div>
      )}

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