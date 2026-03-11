import { create } from 'zustand';
import type { RAMInteractivity } from '#/schemas/storage';

export interface StorageEngineState {
    ramStore: Record<string, any>;
    classificationIndex: Record<string, string[]>;

    /**
     * Dispatches a RAM Interactivity event (Create, Read, Update, Delete)
     * and performs the necessary index tracking.
     */
    dispatchRAMAction: (action: RAMInteractivity) => any | boolean | string | undefined;
}

// Generate a random ID securely
const generateUid = () => 'mem-' + Math.random().toString(36).substring(2, 11);

export const useStorageEngine = create<StorageEngineState>((set, get) => ({
    ramStore: {},
    classificationIndex: {},

    dispatchRAMAction: (request: RAMInteractivity) => {
        const { action, memory_uid, payload, classifications } = request;
        const currentStore = get().ramStore;
        const currentIndex = get().classificationIndex;

        switch (action) {
            case 'create_memory': {
                const newUid = generateUid();

                // 1. Add strictly to flat RAM store
                const newStore = { ...currentStore, [newUid]: payload ?? {} };

                // 2. Append to all requested classifications
                const newIndex = { ...currentIndex };
                if (classifications && classifications.length > 0) {
                    for (const tag of classifications) {
                        if (!newIndex[tag]) {
                            newIndex[tag] = [];
                        }
                        newIndex[tag] = [...newIndex[tag], newUid];
                    }
                }

                set({ ramStore: newStore, classificationIndex: newIndex });
                return newUid;
            }

            case 'read_memory': {
                if (!memory_uid) return undefined;
                return currentStore[memory_uid];
            }

            case 'update_memory': {
                if (!memory_uid || !currentStore[memory_uid]) return false;

                // 1. Update the payload in the RAM store
                const newStore = {
                    ...currentStore,
                    [memory_uid]: { ...currentStore[memory_uid], ...payload }
                };

                // 2. Append ANY NEW classifications provided 
                const newIndex = { ...currentIndex };
                if (classifications && classifications.length > 0) {
                    for (const tag of classifications) {
                        if (!newIndex[tag]) {
                            newIndex[tag] = [];
                        }
                        if (!newIndex[tag].includes(memory_uid)) {
                            newIndex[tag] = [...newIndex[tag], memory_uid];
                        }
                    }
                }

                set({ ramStore: newStore, classificationIndex: newIndex });
                return true;
            }

            case 'delete_memory': {
                if (!memory_uid || !currentStore[memory_uid]) return false;

                // 1. Remove from flat store
                const newStore = { ...currentStore };
                delete newStore[memory_uid];

                // 2. Wipe the UID from wherever it exists in the Classification Index
                const newIndex = { ...currentIndex };
                for (const [tag, uids] of Object.entries(newIndex)) {
                    if (uids.includes(memory_uid)) {
                        const filtered = uids.filter(id => id !== memory_uid);
                        if (filtered.length === 0) {
                            delete newIndex[tag];
                        } else {
                            newIndex[tag] = filtered;
                        }
                    }
                }

                set({ ramStore: newStore, classificationIndex: newIndex });
                return true;
            }

            default:
                return undefined;
        }
    }
}));
