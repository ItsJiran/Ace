import { useEffect, useState } from 'react';
import { BaseWindow } from './components/BaseWindow';
import { DevOverlay } from './components/DevOverlay';
import { useEventEngine } from '#/services/eventEngine';

// Generate random UIDs for fake windows
const generateUid = () => 'win-' + Math.random().toString(36).substring(2, 9);

function App() {
  const [windows, setWindows] = useState<string[]>([]);
  const { subscribe } = useEventEngine();

  useEffect(() => {
    // Listen for the 'open_window' broadcast from the Event Engine (usually fired by Gateway or DevOverlay)
    const unsubscribe = subscribe((event) => {
      if (
        event.listened_event === 'system_command' &&
        event.payload?.action === 'open_window'
      ) {
        setWindows((prev) => [...prev, generateUid()]);
      }
    });

    return unsubscribe;
  }, [subscribe]);

  const removeWindow = (uidToRemove: string) => {
    setWindows((prev) => prev.filter(uid => uid !== uidToRemove));
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-zinc-950 text-white font-sans relative">
      {/* Background Grid for aesthetics */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>

      {/* Render the core OS layout container or just floating windows for now */}
      <div className="absolute inset-0 p-8 flex flex-col items-center justify-center pointer-events-none">
        <h1 className="text-4xl font-extrabold tracking-tighter text-zinc-100 z-0">Engine Verification Sandbox</h1>
        <p className="text-zinc-500 mt-2 max-w-lg text-center font-medium z-0">
          This environment simulates the core headless Event and Storage engines. Use the Dev Overlay to spawn windows, inject RAM, and fire buffered 'Ghost Town' payloads.
        </p>
      </div>

      {/* Spawned Windows */}
      {windows.map((uid) => (
        <BaseWindow key={uid} uid={uid} onClose={removeWindow} />
      ))}

      {/* Render the Developer Engine Debugger Overlay if in Dev Mode */}
      {import.meta.env.DEV && <DevOverlay />}
    </div>
  );
}

export default App;
