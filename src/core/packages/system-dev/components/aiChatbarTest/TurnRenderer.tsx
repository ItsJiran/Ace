import { useAceMemory } from '#/hooks/useAceMemory';
import type { TurnRendererMemory, TurnRendererEntry } from '#/services/turnRendererEngine';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Renders a single turn renderer entry by resolving the component from the registry.
 */
function TurnRendererItem({ entry }: { entry: TurnRendererEntry }) {
    const data = useAceMemory<Record<string, unknown>>(entry.memory_uid);

    const slug = entry.renderer_slug;
    const packageRef = entry.package_ref || 'itsjiran/ace-system';

    try {
        const rendererEntry = window.ACE.registry?.resolveEntry?.(`${packageRef}:renderers:${slug}`);
        const componentEntry = !rendererEntry
            ? window.ACE.registry?.resolveEntry?.(`${packageRef}:components:${slug}`)
            : undefined;
        const Component = typeof (rendererEntry ?? componentEntry) === 'function'
            ? (rendererEntry ?? componentEntry) as React.FC<Record<string, unknown>>
            : null;

        if (!Component) {
            return (
                <div className="text-xs text-zinc-500 border border-zinc-800 rounded p-2 bg-black/30">
                    ⚠ Renderer not found: {slug}
                </div>
            );
        }

        const props: Record<string, unknown> = isObjectRecord(data)
            ? { ...data, __memory_uid: entry.memory_uid, __status: entry.status }
            : { value: data, __memory_uid: entry.memory_uid, __status: entry.status };

        return (
            <div className="my-2 rounded border border-zinc-700 bg-zinc-900/40 p-3 overflow-auto max-h-96">
                <Component {...props} />
            </div>
        );
    } catch (err) {
        return (
            <div className="text-xs text-red-400 border border-red-700 rounded p-2 bg-black/30">
                ✕ Error rendering {slug}: {err instanceof Error ? err.message : String(err)}
            </div>
        );
    }
}

/**
 * TurnRenderer — subscribes to a turn's renderer memory and renders all entries in order.
 *
 * Usage:
 *   <TurnRenderer turnId={msg.turnId} />
 */
export function TurnRenderer({ turnId }: { turnId: string }) {
    const memoryKey = `system:turn:${turnId}:renderers`;
    const turnMemory = useAceMemory<TurnRendererMemory>(memoryKey);

    if (!turnMemory?.renderers?.length) return null;

    return (
        <>
            {turnMemory.renderers.map((entry) => (
                <TurnRendererItem key={`${turnId}-${entry.index}`} entry={entry} />
            ))}
        </>
    );
}
