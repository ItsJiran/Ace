interface PresentationBlock {
    type: 'presentation';
    component_slug: string;
    package_ref?: string;
    memory_key?: string;
    props?: Record<string, unknown>;
}

export function PresentationRenderer({ block }: { block: PresentationBlock }) {
    const componentSlug = block.component_slug || '';
    const packageRef = block.package_ref || 'itsjiran/ace-system';
    const memoryKeyProp = block.memory_key;
    const inlineProps = block.props || {};

    try {
        const registryEntry = window.ACE.registry?.resolveEntry?.(`${packageRef}:components:${componentSlug}`);
        if (!registryEntry) {
            return (
                <div className="text-xs text-zinc-500 border border-zinc-800 rounded p-2 bg-black/30">
                    ⚠ Component not found: {componentSlug}
                </div>
            );
        }

        const Component = registryEntry.component;
        if (!Component) {
            return (
                <div className="text-xs text-zinc-500 border border-zinc-800 rounded p-2 bg-black/30">
                    ⚠ Component {componentSlug} has no render function
                </div>
            );
        }

        let componentData: Record<string, unknown> = inlineProps;
        if (memoryKeyProp) {
            try {
                const memoryData = window.ACE.memory?.read?.(memoryKeyProp);
                if (memoryData) {
                    componentData = { ...memoryData, ...inlineProps };
                }
            } catch (err) {
                console.warn(`Failed to load memory ${memoryKeyProp}:`, err);
            }
        }

        return (
            <div className="my-2 rounded border border-zinc-700 bg-zinc-900/40 p-3 overflow-auto max-h-96">
                <Component {...componentData} />
            </div>
        );
    } catch (err) {
        console.error(`Presentation render error:`, err);
        return (
            <div className="text-xs text-red-400 border border-red-700 rounded p-2 bg-black/30">
                ✕ Error rendering {componentSlug}: {err instanceof Error ? err.message : String(err)}
            </div>
        );
    }
}
