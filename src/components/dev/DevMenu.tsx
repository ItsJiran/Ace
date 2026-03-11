import { WindowEngine } from '#/services/windowEngine';
import { Storage } from '#/services/storageEngine';
import { Layers, HardDrive, Share2, PaintBucket, MoveRight, Power } from 'lucide-react';
import { useStorage } from '#/hooks/useStorage';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { GlobalOverlayState } from '#/schemas/window';

export function DevMenu() {
    const overlayState = useStorage('system:overlay_state') as GlobalOverlayState | undefined;

    // Fallbacks just in case the engine isn't ready
    const isAmbient = overlayState?.mode === 'ambient';
    const isDebugBg = overlayState?.debug_bg ?? false;

    const spawnTestWindow = () => {
        WindowEngine.spawnWindow({
            component_name: 'test_widget',
            x: Math.random() * 200 + 100,
            y: Math.random() * 200 + 100,
            width: 320,
            height: 240,
            title: 'Test Component Widget'
        });
    };

    const toggleOverlayMode = () => {
        WindowEngine.setOverlayMode(isAmbient ? 'interactive' : 'ambient');
    };

    const toggleDebugBg = () => {
        WindowEngine.toggleDebugBg();
    };

    const spawnRAMViewer = () => {
        WindowEngine.spawnWindow({
            component_name: 'ram_viewer',
            x: 50,
            y: 50,
            width: 400,
            height: 500,
            title: 'Global RAM Monitor'
        });
    };

    const moveDebugBox = () => {
        const currentPos = Storage.readMemory('debug:box_pos') as { x: number, y: number };
        if (currentPos) {
            Storage.dispatchRAMAction({
                action: 'update_memory',
                memory_uid: 'debug:box_pos',
                payload: { x: currentPos.x + 50 }
            });
        }
    };

    return (
        <div className="flex flex-col gap-2 w-full h-full text-zinc-300">
            <button
                onClick={spawnTestWindow}
                className="flex items-center gap-2 bg-zinc-800/80 hover:bg-zinc-700 active:bg-zinc-600 px-3 py-2 rounded text-sm transition-colors border border-zinc-700/50"
            >
                <Layers size={14} className="text-blue-400" />
                Spawn Dummy Window
            </button>

            <button
                onClick={spawnRAMViewer}
                className="flex items-center gap-2 bg-zinc-800/80 hover:bg-zinc-700 active:bg-zinc-600 px-3 py-2 rounded text-sm transition-colors border border-zinc-700/50"
            >
                <HardDrive size={14} className="text-emerald-400" />
                Open RAM Viewer
            </button>

            <button
                onClick={moveDebugBox}
                className="flex items-center gap-2 bg-red-900/40 hover:bg-red-800/50 active:bg-red-700/50 px-3 py-2 rounded text-sm transition-colors border border-red-700/50 text-red-200"
            >
                <MoveRight size={14} className="text-red-400" />
                Move RAM Box (+50px)
            </button>

            <button
                onClick={() => { (window as any).moveLocalBox?.(); }}
                className="flex items-center gap-2 bg-emerald-900/40 hover:bg-emerald-800/50 active:bg-emerald-700/50 px-3 py-2 rounded text-sm transition-colors border border-emerald-700/50 text-emerald-200"
            >
                <MoveRight size={14} className="text-emerald-400" />
                Move State Box (+50px)
            </button>

            <button
                onClick={toggleDebugBg}
                className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors border ${isDebugBg ? 'bg-amber-900/40 border-amber-500/50 text-amber-100 hover:bg-amber-800/50' : 'bg-zinc-800/80 border-zinc-700/50 text-zinc-400 hover:bg-zinc-700'}`}
            >
                <PaintBucket size={14} className={isDebugBg ? "text-amber-400" : "text-zinc-500"} />
                {isDebugBg ? 'Hide Layer Bounds' : 'Show Layer Bounds'}
            </button>

            <button
                onClick={toggleOverlayMode}
                className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors border ${isAmbient ? 'bg-zinc-800/80 border-zinc-700/50 text-zinc-400' : 'bg-red-900/40 border-red-500/50 text-red-100 hover:bg-red-800/50'}`}
            >
                <Share2 size={14} className={isAmbient ? "text-blue-400" : "text-red-300"} />
                {isAmbient ? 'Enter Interactive Mode' : 'Exit Interactive Mode'}
            </button>

            <button
                onClick={() => getCurrentWindow().close()}
                className="flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors border mt-auto bg-red-950/60 border-red-800/50 text-red-300 hover:bg-red-900/80 hover:text-red-100"
            >
                <Power size={14} className="text-red-400" />
                Quit Application
            </button>
        </div>
    );
}
