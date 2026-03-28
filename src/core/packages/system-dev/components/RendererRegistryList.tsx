import type { AceRegistryType } from '#/schemas/registryTypes';

export const registry: AceRegistryType.Component = {
    name: 'renderer_registry_list',
    slug: 'renderer-registry-list',
    react_behavior: 'renderer_registry_list',
};

export default function RendererRegistryList() {
    type RendererEntry = ReturnType<typeof window.ACE.registry.listRenderers>[number];
    const renderers: RendererEntry[] = window.ACE.registry.listRenderers();

    return (
        <div className="h-full w-full overflow-auto bg-zinc-950 text-zinc-200 p-3">
            <div className="mb-3">
                <div className="text-xs uppercase tracking-wider text-zinc-500">Renderers</div>
                <div className="text-sm font-semibold">Registered Presentation Renderers</div>
                <div className="text-[11px] text-zinc-500 mt-1">Total: {renderers.length}</div>
            </div>

            {renderers.length === 0 && (
                <div className="rounded border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-400">
                    No renderers registered. Add entries to the <code className="text-zinc-300">renderers/</code> folder
                    of a package and export <code className="text-zinc-300">registry: AceRegistryType.Renderer</code>.
                </div>
            )}

            <div className="space-y-2">
                {renderers.map((item) => {
                    const meta = item.metadata as Record<string, unknown>;
                    const formats = Array.isArray(meta.supported_formats) ? (meta.supported_formats as string[]) : [];
                    const inputTypes = Array.isArray(meta.input_types) ? (meta.input_types as string[]) : [];

                    return (
                        <div
                            key={`${item.package_name}:${item.slug}`}
                            className="rounded border border-zinc-800 bg-zinc-900/70 p-2"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <div className="text-xs text-zinc-400">{item.package_name}:renderers:{item.slug}</div>
                                <div className="text-[10px] rounded bg-zinc-800 px-2 py-0.5 text-zinc-300 font-mono">
                                    {item.slug}
                                </div>
                            </div>

                            <div className="mt-1 text-sm font-medium text-zinc-100">{item.name}</div>

                            {item.description && (
                                <div className="mt-0.5 text-[11px] text-zinc-400">{item.description}</div>
                            )}

                            <div className="mt-2 flex flex-wrap gap-1">
                                {formats.map((f) => (
                                    <span
                                        key={f}
                                        className="text-[10px] rounded bg-indigo-900/50 border border-indigo-700/40 px-1.5 py-0.5 text-indigo-300"
                                    >
                                        {f}
                                    </span>
                                ))}
                                {inputTypes.map((t) => (
                                    <span
                                        key={t}
                                        className="text-[10px] rounded bg-zinc-800 border border-zinc-700/50 px-1.5 py-0.5 text-zinc-400"
                                    >
                                        {t}
                                    </span>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
