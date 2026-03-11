// This represents the Active UI Component (The Interactor). 
// One Dumb Window can hold multiple components like this.
import React from 'react';
import { useStorageEngine } from '../../services/storageEngine';
import { useEventEngine } from '../../services/eventEngine';
import type { Listener } from '../../schemas/events';

export const SystemMonitorWidget: React.FC = () => {
    // 1. Subscribe to Global RAM (Where the Headless Process dumped the data)
    const { ramStore } = useStorageEngine();

    // 2. The Interaction Emitter (To tell the Chef what to do)
    const { dispatch } = useEventEngine();

    // Pull the raw data out of RAM using a known key, or safely fall back
    const metricsPayload = ramStore['sys_metric_buffer']?.raw_json;
    const metrics = metricsPayload ? JSON.parse(metricsPayload) : null;

    const requestRefresh = () => {
        // Emit an order ticket up to the Event Engine.
        // The Component does NOT execute shell commands itself!
        dispatch({
            event_type: 'interaction',
            process_uid: 'global', // We don't care who executes it
            action: 'execute_tool',
            sub_action: 'get_os_process_list',
            payload: {}
        });
    };

    return (
        <div className="bg-black/50 p-4 rounded-lg backdrop-blur-md border border-white/10 text-xs font-mono text-green-400">
            <h3 className="text-white font-sans font-bold mb-2 uppercase tracking-widest text-[10px]">OS Metrics</h3>
            {!metrics ? (
                <div className="animate-pulse">Awaiting Chef...</div>
            ) : (
                <div className="space-y-1">
                    <div>CPU: {metrics.cpu}%</div>
                    <div>RAM: {metrics.ram}GB</div>
                </div>
            )}

            <button
                onClick={requestRefresh}
                className="mt-4 px-2 py-1 bg-white/10 hover:bg-white/20 transition-colors text-white rounded"
            >
                Force Refresh
            </button>
        </div>
    );
};
