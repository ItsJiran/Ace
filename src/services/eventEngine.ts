import { create } from 'zustand';
import type { Listener } from '#/schemas/events';

type WindowStatus = 'booting' | 'ready' | 'closed';

export interface EventEngineState {
    windowRegistry: Record<string, WindowStatus>;
    mountingBuffer: Record<string, Listener[]>;
    listeners: Array<(event: Listener) => void>;

    registerWindow: (uid: string, status: WindowStatus) => void;
    setWindowStatus: (uid: string, status: WindowStatus) => void;
    subscribe: (callback: (event: Listener) => void) => () => void;
    dispatch: (event: Listener) => void;
}

export const useEventEngine = create<EventEngineState>((set, get) => ({
    windowRegistry: {},
    mountingBuffer: {},
    listeners: [],

    registerWindow: (uid: string, status: WindowStatus) => {
        set((state) => ({
            windowRegistry: { ...state.windowRegistry, [uid]: status }
        }));
    },

    setWindowStatus: (uid: string, status: WindowStatus) => {
        set((state) => {
            const newRegistry = { ...state.windowRegistry, [uid]: status };

            // If the window is now ready, flush its buffer!
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

                return { windowRegistry: newRegistry, mountingBuffer: newBuffer };
            }

            return { windowRegistry: newRegistry };
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
        const { target_window_uid } = event;
        const state = get();

        // 1. Is there a target window provided?
        if (target_window_uid) {
            const status = state.windowRegistry[target_window_uid];

            // 1a. If the window is explicitly 'booting', buffer it! (Ghost Town prevention)
            if (status === 'booting') {
                set((state) => {
                    const currentBufferForWindow = state.mountingBuffer[target_window_uid] || [];
                    return {
                        mountingBuffer: {
                            ...state.mountingBuffer,
                            [target_window_uid]: [...currentBufferForWindow, event]
                        }
                    };
                });
                return; // DO NOT fire the listeners yet.
            }

            // 1b. If the window is 'closed', drop it into the void.
            if (status === 'closed') {
                return;
            }
        }

        // 2. Either no target was specified (Broadcast), or the target is 'ready'. 
        // Fire all listeners!
        state.listeners.forEach(listener => listener(event));
    }
}));
