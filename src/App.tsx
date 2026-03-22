import { useEffect, useState } from 'react';
import { useAceMemory } from '#/hooks/useAceMemory';
import type { GlobalOverlayState } from '#/schemas/window';
import { RegistryEngine } from '#/services/registryEngine';

function App() {
  const [isBootReady, setIsBootReady] = useState(false);

  // Block default browser devtools shortcuts (F12, Ctrl+Shift+I)
  // And Bind Custom DevTools (Cmd+Shift+J)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Block Native DevTools
      if (
        e.key === 'F12' || 
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'I')
      ) {
        e.preventDefault();
        e.stopPropagation();
      }

      // 2. Open ACE DevTools (Cmd+Shift+J)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'j') {
          e.preventDefault();
          // Spawn via Window Engine directly
          if (window.ACE?.window) {
              window.ACE.window.spawnWindow({
                  component_name: 'itsjiran/ace-system-dev:components:ace-devtools',
                  title: 'ACE DevTools',
                  width: 800,
                  height: 480,
                  chrome_style: 'system',
              });
          }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true); // Capture phase
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

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

  // 1. O(1) Hooks watching the global WindowEngine Maps
  const overlayState = useAceMemory<GlobalOverlayState>('system:overlay_state');
  
  // Refactored: App.tsx only watches the *list* of active windows, not their configs.
  // This prevents the entire app from re-rendering when a single window drags (config changes).
  const activeWindows = useAceMemory<Array<{ uid: string, component: string }>>('system:active_windows') || [];

  if (!isBootReady || !overlayState) return null;

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
      {activeWindows.map(entry => {
        // Resolve purely from windows domain, assuming window components handle their own shell
        const Component = RegistryEngine.resolveEntry(entry.component) as React.ComponentType<{ windowUid: string }> | undefined;

        if (!Component) return null;

        return (
          <Component 
            key={entry.uid} 
            windowUid={entry.uid}
          />
        );
      })}

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
