import { useAceMemory } from '#/hooks/useAceMemory';

type EventStreamItem = {
    id: string;
    at: number;
    status: 'emitted' | 'routed' | 'dropped';
    action: string;
    sub_action: string | null;
    process_uid: string | null;
    payload: Record<string, unknown>;
};

export const config = {
    name: 'event_viewer',
    data_requirements: [],
    emits_interactions: [],
    listens_to: [],
    react_behavior: 'dev_event_stream',
};

export function EventViewer() {
    const events = (useAceMemory<EventStreamItem[]>('system:event_stream') || []).slice().reverse();

    return (
        <div className="h-full w-full bg-zinc-950/90 border border-zinc-800 rounded-xl overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-zinc-800 bg-zinc-900/90">
                <p className="text-xs font-semibold text-cyan-300">Event Viewer</p>
                <p className="text-[11px] text-zinc-500">Recent EventBus interactions</p>
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-2">
                {events.length === 0 ? (
                    <p className="text-xs text-zinc-500">No events yet.</p>
                ) : (
                    events.map((event) => (
                        <div key={event.id} className="rounded border border-zinc-800 bg-zinc-900/60 p-2">
                            <div className="flex items-center justify-between text-[11px] mb-1">
                                <span className="text-zinc-300">{event.action}{event.sub_action ? `:${event.sub_action}` : ''}</span>
                                <span className="text-zinc-500">{new Date(event.at).toLocaleTimeString()}</span>
                            </div>
                            <div className="text-[10px] text-zinc-400 mb-1">
                                status: <span className="text-zinc-300">{event.status}</span>
                                {event.process_uid ? ` | pid: ${event.process_uid}` : ''}
                            </div>
                            <pre className="text-[10px] text-zinc-500 overflow-auto">{JSON.stringify(event.payload, null, 2)}</pre>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
