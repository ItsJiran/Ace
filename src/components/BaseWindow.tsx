import React, { useEffect, useState } from 'react';
import { useEventEngine } from '#/services/eventEngine';
import type { Listener } from '#/schemas/events';

interface BaseWindowProps {
    uid: string;
    onClose: (uid: string) => void;
}

export const BaseWindow: React.FC<BaseWindowProps> = ({ uid, onClose }) => {
    const { registerWindow, setWindowStatus, subscribe } = useEventEngine();
    const [events, setEvents] = useState<Listener[]>([]);
    const [status, setStatus] = useState<'booting' | 'ready'>('booting');

    useEffect(() => {
        // 1. Register as booting (simulating Electron window creation latency)
        registerWindow(uid, 'booting');

        // 2. Subscribe to the event engine
        const unsubscribe = subscribe((event) => {
            // Only care about events targeting us, or broadcasts
            if (!event.target_window_uid || event.target_window_uid === uid) {
                setEvents((prev) => [...prev, event]);
            }
        });

        // 3. Simulate React painting and mounting delay, then mark as ready.
        // This is where "Ghost Town" payloads get buffered, then flushed when this timeout hits!
        const timer = setTimeout(() => {
            setStatus('ready');
            setWindowStatus(uid, 'ready');
        }, 1000); // 1 entire second of fake latency!

        return () => {
            clearTimeout(timer);
            unsubscribe();
            // When unmounting, we typically mark as closed
            setWindowStatus(uid, 'closed');
        };
    }, [uid, registerWindow, setWindowStatus, subscribe]);

    const handleClose = () => {
        setWindowStatus(uid, 'closed');
        onClose(uid);
    };

    return (
        <div className="absolute border border-zinc-700 bg-zinc-900 shadow-2xl rounded-xl p-4 min-w-[300px] min-h-[200px]" style={{
            top: `${Math.random() * 40 + 10}%`,
            left: `${Math.random() * 40 + 10}%`,
        }}>
            <div className="flex justify-between items-center mb-4 border-b border-zinc-800 pb-2">
                <div>
                    <h3 className="text-zinc-100 font-bold text-sm">Window UI</h3>
                    <p className="text-zinc-500 text-xs font-mono">{uid}</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${status === 'booting' ? 'bg-amber-900/50 text-amber-500' : 'bg-green-900/50 text-green-500'}`}>
                        {status}
                    </span>
                    <button onClick={handleClose} className="text-zinc-500 hover:text-red-400 transition-colors">
                        ✕
                    </button>
                </div>
            </div>

            <div className="space-y-2">
                <p className="text-xs text-zinc-400 font-semibold uppercase">Received Events</p>
                <div className="bg-zinc-950 p-2 rounded max-h-[150px] overflow-y-auto text-xs font-mono text-zinc-300">
                    {events.length === 0 ? (
                        <span className="text-zinc-600">No events yet...</span>
                    ) : (
                        events.map((ev, i) => (
                            <div key={i} className="mb-2 pb-2 border-b border-zinc-900 last:border-0 last:mb-0 last:pb-0">
                                <span className="text-blue-400">{ev.listened_event}</span>
                                <pre className="mt-1 text-zinc-500 overflow-x-auto">
                                    {JSON.stringify(ev.payload, null, 2)}
                                </pre>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};
