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
 * TurnRenderer — subscribes to a specific Turn's Kernel Memory block
 * and renders the isolated loop (User Prompt + Assistant Stream)
 */
export function TurnRenderer({ turnMemoryUid }: { turnMemoryUid: string }) {
    // Subscribe directly to the turn block! O(1) isolation.
    const turn = useAceMemory<any>(turnMemoryUid);

    // Optional: hook for extensions (like tools) linked to this turn. 
    // We assume turn.active_response_turn_id represents the ID for extensions if needed.
    const parsedTurnId = turn?.active_response_turn_id;
    const rendererMemoryKey = parsedTurnId ? `system:turn:${parsedTurnId}:renderers` : null;
    const extensions = useAceMemory<TurnRendererMemory>(rendererMemoryKey);

    if (!turn) return null;

    return (
        <div className="w-full space-y-2 mb-4">
            {/* User Prompt Bubble */}
            {turn.prompt && (
                <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-xl px-3 py-2 border whitespace-pre-wrap text-sm bg-cyan-700/40 border-cyan-500/40 text-cyan-50">
                        <div className="text-[10px] uppercase tracking-wide mb-1 opacity-70">You</div>
                        <div>{turn.original_prompt || turn.prompt}</div>
                    </div>
                </div>
            )}

            {/* Assistant Streaming Bubble */}
            <div className="flex justify-start">
                <div className="max-w-[85%] rounded-xl px-3 py-2 border whitespace-pre-wrap text-sm bg-zinc-900 border-zinc-700 text-zinc-200">
                    <div className="text-[10px] uppercase tracking-wide mb-1 opacity-70">Assistant</div>
                    <div>{turn.text || '...'}</div>
                    
                    <div className="mt-2 text-[10px] text-zinc-500">
                        status: {turn.status || '-'} | batches: {turn.parser_batch_count ?? 0} | events: {turn.events_total ?? 0}
                    </div>
                </div>
            </div>

            {/* Extension Component Renderers (Tool outputs, UI injections) */}
            {extensions?.renderers?.map((entry) => (
                <TurnRendererItem key={`${parsedTurnId}-${entry.index}`} entry={entry} />
            ))}
        </div>
    );
}
