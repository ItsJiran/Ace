import type { AceRegistryType } from '#/schemas/registryTypes';
import { useEffect, useState } from 'react';
import { ToolEngine } from '#/services/toolEngine';

type ToolItem = {
    name: string;
    description: string;
};

export const registry: AceRegistryType.Component = {
    name: 'tools_registry_list',
    react_behavior: 'dev_tools_registry',
};

export default function ToolsRegistryList() {
    const [tools, setTools] = useState<ToolItem[]>([]);

    useEffect(() => {
        const refresh = () => {
            const manifest = ToolEngine.getManifest() as ToolItem[];
            setTools(manifest);
        };

        refresh();
        const id = window.setInterval(refresh, 1000);
        return () => window.clearInterval(id);
    }, []);

    return (
        <div className="h-full w-full bg-zinc-950/90 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/90">
                <p className="text-xs font-semibold text-amber-300">Tools Registry List</p>
                <p className="text-[11px] text-zinc-500">Registered executable tools</p>
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-2">
                {tools.length === 0 ? (
                    <p className="text-xs text-zinc-500">No tools found.</p>
                ) : tools.map((tool) => (
                    <div key={tool.name} className="rounded border border-zinc-800 bg-zinc-900/60 p-2 text-[11px]">
                        <div className="text-zinc-300">{tool.name}</div>
                        <div className="text-zinc-500">{tool.description}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
