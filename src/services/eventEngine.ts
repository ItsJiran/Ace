import { create } from 'zustand';
import type { Listener } from '#/schemas/events';

type ProcessStatus = 'booting' | 'ready' | 'closed';

export interface EventEngineState {
    processRegistry: Record<string, ProcessStatus>;
    mountingBuffer: Record<string, Listener[]>;
    listeners: Array<(event: Listener) => void>;

    registerProcess: (uid: string, status: ProcessStatus) => void;
    setProcessStatus: (uid: string, status: ProcessStatus) => void;
    subscribe: (callback: (event: Listener) => void) => () => void;
    dispatch: (event: Listener) => void;
}

export const useEventEngine = create<EventEngineState>((set, get) => ({
    processRegistry: {},
    mountingBuffer: {},
    listeners: [],

    registerProcess: (uid: string, status: ProcessStatus) => {
        set((state) => ({
            processRegistry: { ...state.processRegistry, [uid]: status }
        }));
    },

    setProcessStatus: (uid: string, status: ProcessStatus) => {
        set((state) => {
            const newRegistry = { ...state.processRegistry, [uid]: status };

            // If the process is now ready, flush its buffer!
            if (status === 'ready') {
                const buffer = state.mountingBuffer[uid];
                if (buffer && buffer.length > 0) {
                    // We must dispatch these to the listeners
                    // Wait, we can't synchronously dispatch while setting state easily without a loop here,
                    // but we can just call get().dispatch() or fire listeners directly.
                    // It's safer to just fire the listeners directly to avoid infinite loops
                    const currentListeners = get().listeners;
                    buffer.forEach(event => {
                        currentListeners.forEach(listener => listener(event));
                    });
                }

                // Delete the flushed buffer
                const newBuffer = { ...state.mountingBuffer };
                delete newBuffer[uid];

                return { processRegistry: newRegistry, mountingBuffer: newBuffer };
            }

            return { processRegistry: newRegistry };
        });
    },

    subscribe: (callback: (event: Listener) => void) => {
        set((state) => ({
            listeners: [...state.listeners, callback]
        }));

        // Return unsubscribe function
        return () => {
            set((state) => ({
                listeners: state.listeners.filter(l => l !== callback)
            }));
        };
    },

    dispatch: (event: Listener) => {
        const { target_process_uid } = event;
        const state = get();

        // 1. Is there a target process provided?
        if (target_process_uid) {
            const status = state.processRegistry[target_process_uid];

            // 1a. If the process is explicitly 'booting', buffer it! (Ghost Town prevention)
            if (status === 'booting') {
                set((state) => {
                    const currentBufferForProcess = state.mountingBuffer[target_process_uid] || [];
                    return {
                        mountingBuffer: {
                            ...state.mountingBuffer,
                            [target_process_uid]: [...currentBufferForProcess, event]
                        }
                    };
                });
                return; // DO NOT fire the listeners yet.
            }

            // 1b. If the process is 'closed', drop it into the void.
            if (status === 'closed') {
                return;
            }
        }

        // 2. Either no target was specified (Broadcast), or the target is 'ready'. 
        // Fire all listeners!
        state.listeners.forEach(listener => listener(event));
    }
}));
