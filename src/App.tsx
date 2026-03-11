import { useEffect, useState } from 'react';
import { BaseWindow } from './components/layout/BaseWindow';
import { useStorage } from '#/hooks/useStorage';
import type { GlobalOverlayState, WindowConfig } from '#/schemas/window';
import { Storage } from '#/services/storageEngine';

// 🚀 IMPORT TAURI API (Untuk memaksa ukuran window ke OS)
import { getCurrentWindow, PhysicalSize, PhysicalPosition } from '@tauri-apps/api/window';

function App() {
  const [localBoxPos, setLocalBoxPos] = useState({ x: 200, y: 360 });

  // 🚀 TAURI OVERLAY SETUP: Memaksa OS menyesuaikan ukuran dengan layar
  useEffect(() => {
    const setupTauriOverlay = async () => {
      try {
        // Cek apakah kita benar-benar berjalan di dalam Tauri (bukan sekadar di browser biasa)
        if (window.__TAURI_INTERNALS__ || window.__TAURI__) {
          const appWindow = getCurrentWindow();
          const monitor = await appWindow.monitor();

          if (monitor) {
            // 1. Sesuaikan ukuran window Tauri dengan resolusi piksel layar
            await appWindow.setSize(new PhysicalSize(monitor.size.width, monitor.size.height));
            // 2. Kunci posisi window di pojok kiri atas monitor
            await appWindow.setPosition(new PhysicalPosition(0, 0));
          }
          // 3. Munculkan window (menghindari kedipan putih saat awal boot)
          await appWindow.show();
        }
      } catch (err) {
        console.error("Gagal melakukan setup overlay Tauri:", err);
      }
    };

    setupTauriOverlay();
  }, []);

  // Listen for the 'Escape' key to globally panic back to Ambient Mode if stuck
  useEffect(() => {
    // Expose local state setter to window for DevMenu to trigger
    (window as any).moveLocalBox = () => {
      setLocalBoxPos(prev => ({ ...prev, x: prev.x + 50 }));
    };

    let initialized = false;

    // Technically this should be IPC to electron/Tauri, but for the React dev layer:
    import('./services/windowEngine').then(({ WindowEngine }) => {
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
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      delete (window as any).moveLocalBox;
    };
  }, []);

  // 1. O(1) Hooks watching the global WindowEngine Maps
  const overlayState = useStorage('system:overlay_state') as GlobalOverlayState | undefined;
  const windows = useStorage('system:windows') as Record<string, WindowConfig> | undefined;
  const debugPos = useStorage('debug:box_pos') as { x: number, y: number } | undefined;

  if (!overlayState || !windows) return null;

  const isAmbient = overlayState.mode === 'ambient';
  const isDebugBg = overlayState.debug_bg;

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

      {/* Pure Redraw Debug Box (React useState) */}
      <div
        className="absolute w-32 h-32 bg-emerald-500 rounded-xl shadow-2xl transition-transform duration-200 flex items-center justify-center text-white text-xs font-bold text-center pointer-events-auto"
        style={{ transform: `translate3d(${localBoxPos.x}px, ${localBoxPos.y}px, 0)` }}
      >
        useState<br />(GREEN)
      </div>

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