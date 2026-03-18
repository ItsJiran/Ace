import type { WindowConfig } from '#/schemas/window';

export function WindowRegistryList() {
    const windows = window.ACE.memory.use<Record<string, WindowConfig>>('system:windows') || {};
    const rows = Object.values(windows).sort((a, b) => b.z_index - a.z_index);

    return (
        <div className="h-full w-full bg-zinc-950/90 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/90">
                <p className="text-xs font-semibold text-rose-300">Window Registry List</p>
                <p className="text-[11px] text-zinc-500">Live window map from RAM</p>
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-2">
                {rows.length === 0 ? (
                    <p className="text-xs text-zinc-500">No windows mounted.</p>
                ) : rows.map((win) => (
                    <div key={win.window_uid} className="rounded border border-zinc-800 bg-zinc-900/60 p-2 text-[11px]">
                        <div className="text-zinc-300">{win.title || win.component_name}</div>
                        <div className="text-zinc-500">uid: {win.window_uid}</div>
                        <div className="text-zinc-500">component: {win.component_name} | z: {win.z_index}</div>
                        <div className="text-zinc-500">x:{win.x} y:{win.y} w:{win.width} h:{win.height}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
