import React, { useEffect, useState } from 'react';
import { useEventEngine } from '#/services/eventEngine';
import { useStorageEngine } from '#/services/storageEngine';
import type { Listener } from '#/schemas/events';

export const DevOverlay: React.FC = () => {
    const { windowRegistry, dispatch, subscribe } = useEventEngine();
    const { ramStore, classificationIndex, dispatchRAMAction } = useStorageEngine();

    const [eventLog, setEventLog] = useState<Listener[]>([]);
    const [selectedTab, setSelectedTab] = useState<'registry' | 'ram' | 'events'>('registry');
    const [selectedWindow, setSelectedWindow] = useState<string | null>(null);

    // Global listener to keep a history of all events dispatched through the engine
    useEffect(() => {
        const unsub = subscribe((ev) => setEventLog(prev => [ev, ...prev].slice(0, 50)));
        return () => unsub();
    }, [subscribe]);

    const spawnWindow = () => {
        dispatch({
            event_type: 'listener',
            listened_event: 'system_command',
            source_uid: 'dev-overlay',
            reaction: { reaction_type: 'custom' },
            payload: { action: 'open_window' }
        });
    };

    const spawnGhostTownEvent = () => {
        if (!selectedWindow) return alert('Select a window UID from the registry tab first!');

        // This fires instantly. If the target window is still 'booting', it hits the mounting buffer!
        dispatch({
            event_type: 'listener',
            target_window_uid: selectedWindow,
            listened_event: 'ghost_town_test',
            source_uid: 'dev-overlay',
            reaction: { reaction_type: 'custom' },
            payload: { message: 'I was waiting in the buffer!' }
        });
    };

    const injectRAM = () => {
        dispatchRAMAction({
            action: 'create_memory',
            window_uid: 'dev-overlay',
            payload: { timestamp: Date.now(), source: 'Dev UI Injection' },
            classifications: ['type:debug']
        });
    };

    return (
        <div className="fixed bottom-4 right-4 w-[400px] bg-zinc-950/95 backdrop-blur-xl border border-zinc-800 rounded-xl shadow-2xl overflow-hidden text-sm font-sans flex flex-col max-h-[600px] z-50">
            {/* Header */}
            <div className="bg-zinc-900 border-b border-zinc-800 p-3 flex justify-between items-center">
                <span className="font-bold text-zinc-100 text-xs uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    Dev Engine Debugger
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">import.meta.env.DEV</span>
            </div>

            {/* Toolbar */}
            <div className="p-2 gap-2 flex bg-zinc-900/50 border-b border-zinc-800 overflow-x-auto hide-scrollbar">
                <button onClick={spawnWindow} className="whitespace-nowrap bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded text-xs font-semibold transition-colors">
                    + Window
                </button>
                <button onClick={spawnGhostTownEvent} className="whitespace-nowrap bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded text-xs font-semibold transition-colors">
                    Fire Target Event
                </button>
                <button onClick={injectRAM} className="whitespace-nowrap bg-teal-600 hover:bg-teal-500 text-white px-3 py-1.5 rounded text-xs font-semibold transition-colors">
                    Inject RAM
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-zinc-800 text-xs">
                {['registry', 'ram', 'events'].map(tab => (
                    <button
                        key={tab}
                        onClick={() => setSelectedTab(tab as any)}
                        className={`flex-1 py-2 text-center font-medium capitalize transition-colors ${selectedTab === tab ? 'bg-zinc-800 text-zinc-100 border-b-2 border-indigo-500' : 'text-zinc-500 hover:bg-zinc-900'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="p-0 overflow-y-auto flex-1 bg-black/20 text-xs font-mono">
                {selectedTab === 'registry' && (
                    <div className="p-3">
                        {Object.entries(windowRegistry).map(([uid, status]) => (
                            <div
                                key={uid}
                                onClick={() => setSelectedWindow(uid)}
                                className={`p-2 mb-2 rounded border cursor-pointer transition-colors ${selectedWindow === uid ? 'border-indigo-500 bg-indigo-500/10' : 'border-zinc-800 hover:border-zinc-600'}`}
                            >
                                <div className="flex justify-between items-center text-zinc-300">
                                    <span>{uid}</span>
                                    <span className={status === 'booting' ? 'text-amber-500' : status === 'ready' ? 'text-emerald-500' : 'text-zinc-600'}>
                                        [{status}]
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {selectedTab === 'ram' && (
                    <div className="p-3">
                        <div className="mb-4">
                            <h4 className="text-zinc-500 uppercase tracking-widest text-[10px] mb-2 font-sans font-bold">Global Flat Store</h4>
                            <pre className="text-zinc-300 overflow-x-auto bg-zinc-900 p-2 rounded border border-zinc-800">
                                {JSON.stringify(ramStore, null, 2)}
                            </pre>
                        </div>
                        <div>
                            <h4 className="text-zinc-500 uppercase tracking-widest text-[10px] mb-2 font-sans font-bold">Classification Index</h4>
                            <pre className="text-zinc-300 overflow-x-auto bg-zinc-900 p-2 rounded border border-zinc-800">
                                {JSON.stringify(classificationIndex, null, 2)}
                            </pre>
                        </div>
                    </div>
                )}

                {selectedTab === 'events' && (
                    <div className="p-3 flex flex-col gap-2">
                        {eventLog.map((ev, i) => (
                            <div key={i} className="bg-zinc-900 p-2 rounded border border-zinc-800 text-zinc-300">
                                <div className="text-indigo-400 font-bold mb-1">{ev.listened_event} <span className="text-zinc-600 font-normal">from {ev.source_uid}</span></div>
                                <div className="text-zinc-500">Target: {ev.target_window_uid || 'Broadcast'}</div>
                                <pre className="mt-2 text-zinc-400 overflow-x-auto">
                                    {JSON.stringify(ev.payload, null, 2)}
                                </pre>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
