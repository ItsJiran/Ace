import { useEffect, useState } from 'react';
import { useAceMemory } from '#/hooks/useAceMemory';
import type { GlobalOverlayState, WindowConfig } from '#/schemas/window';
import { RegistryEngine } from '#/services/registryEngine';
import type { RegistryDomainEntry } from '#/schemas/registry';


function App() {
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
      {Object.values(windows).map(config => {
        // Resolve purely from windows domain, assuming window components handle their own shell
        const entry = RegistryEngine.resolveEntry(config.component_name, 'windows') as RegistryDomainEntry | null;
        const Component = entry?.implementation as React.ComponentType<{ config: WindowConfig; windowUid: string; payloadMemoryUid?: string }> | undefined;

        if (!Component) return null;

        return (
          <Component 
            key={config.window_uid} 
            config={config}
            windowUid={config.window_uid}
            payloadMemoryUid={config.payload_memory_uid}
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
