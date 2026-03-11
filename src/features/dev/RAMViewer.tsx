import { useState, useEffect } from 'react';
import { Storage } from '#/services/storageEngine';

/**
 * A Developer tool that reads directly from the StorageEngine map.
 * Since the StorageEngine doesn't broadcast a global "everything changed" event (for performance),
 * we'll use a fast poll or just a manual refresh button for now to peek at the Map state.
 */
export function RAMViewer() {
    const [snapshot, setSnapshot] = useState<string>('');

    const refreshRAM = () => {
        // Accessing the private properties via any cast for dev visualization
        const globalRam = (Storage as any).global_ram as Map<string, any>;
        const classRam = (Storage as any).classification_ram as Map<string, string[]>;

        const data = {
            GLOBAL_RAM: Object.fromEntries(globalRam.entries()),
            CLASSIFICATION_INDEX: Object.fromEntries(classRam.entries())
        };

        setSnapshot(JSON.stringify(data, null, 2));
    };

    // Initial snapshot
    useEffect(() => {
        refreshRAM();
    }, []);

    return (
        <div className="flex flex-col h-full bg-zinc-950/50 rounded overflow-hidden border border-zinc-800">
            <div className="p-2 bg-zinc-900 border-b border-zinc-800 flex justify-between items-center">
                <span className="text-xs font-bold text-emerald-500 uppercase">Live RAM Mapping</span>
                <button
                    onClick={refreshRAM}
                    className="text-xs bg-emerald-900/40 text-emerald-400 px-2 py-1 rounded hover:bg-emerald-800/60"
                >
                    Refresh
                </button>
            </div>
            <div className="flex-1 overflow-auto p-3">
                <pre className="text-[10px] sm:text-xs font-mono text-zinc-300 leading-relaxed">
                    {snapshot}
                </pre>
            </div>
        </div>
    );
}
