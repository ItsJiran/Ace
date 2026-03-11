import type { RAMInteractivity } from '#/schemas/storage';

const generateUid = () => 'mem-' + Math.random().toString(36).substring(2, 11);

class StorageEngineSingleton {
    // 1. Global RAM: memory_uid => payload
    private global_ram = new Map<string, any>();

    // 2. Classification RAM: tag => [memory_uid, memory_uid]
    private classification_ram = new Map<string, string[]>();

    // 3. THE SOCKETS: key => [array of callback functions]
    private memory_sockets = new Map<string, Function[]>();

    // ==========================================
    // 🔌 SOCKET METHODS (Listening to Data)
    // ==========================================

    /**
     * Subscribes a React component (or Process) to a specific memory UID or Classification.
     * @returns A cleanup function to unsubscribe.
     */
    subscribe(key: string, callback: (data: any) => void) {
        if (!this.memory_sockets.has(key)) {
            this.memory_sockets.set(key, []);
        }

        this.memory_sockets.get(key)!.push(callback);

        return () => {
            const listeners = this.memory_sockets.get(key) || [];
            this.memory_sockets.set(key, listeners.filter(cb => cb !== callback));
            if (this.memory_sockets.get(key)!.length === 0) {
                this.memory_sockets.delete(key);
            }
        };
    }

    // ==========================================
    // 💾 RAM METHODS (Reading Data)
    // ==========================================

    /**
     * Reads a payload directly from RAM.
     */
    readMemory(uid: string) {
        return this.global_ram.get(uid);
    }

    /**
     * Reads an array of UIDs directly from the Classification Index.
     */
    readClassification(tag: string) {
        return this.classification_ram.get(tag);
    }

    // ==========================================
    // 💾 RAM METHODS (Writing Data)
    // ==========================================

    /**
     * Processes an interaction request to mutate the Storage Engine.
     */
    dispatchRAMAction(request: RAMInteractivity) {
        const { action, memory_uid, payload, classifications } = request;

        switch (action) {
            case 'create_memory': {
                const newUid = memory_uid || generateUid();
                this.writeMemory(newUid, payload, classifications);
                return newUid;
            }

            case 'read_memory': {
                if (!memory_uid) return undefined;
                return this.readMemory(memory_uid);
            }

            case 'update_memory': {
                if (!memory_uid || !this.global_ram.has(memory_uid)) return false;

                const existingPayload = this.global_ram.get(memory_uid);
                const mergedPayload = { ...existingPayload, ...payload };

                this.writeMemory(memory_uid, mergedPayload, classifications);
                return true;
            }

            case 'delete_memory': {
                if (!memory_uid || !this.global_ram.has(memory_uid)) return false;

                // 1. Remove from Global RAM
                this.global_ram.delete(memory_uid);

                // 2. Remove from Classification RAM
                for (const [tag, uids] of this.classification_ram.entries()) {
                    if (uids.includes(memory_uid)) {
                        const filtered = uids.filter(id => id !== memory_uid);
                        if (filtered.length === 0) {
                            this.classification_ram.delete(tag);
                        } else {
                            this.classification_ram.set(tag, filtered);
                        }
                    }
                }

                // 3. Fire socket to let components know data was deleted
                this.fireSockets(memory_uid, null);
                return true;
            }
        }
    }

    /**
     * Internal write function that instantly fires the reactive sockets.
     */
    private writeMemory(uid: string, payload: any, classifications: string[] = []) {
        // 1. Update Global RAM
        this.global_ram.set(uid, payload);

        // 2. Update Classification RAM
        classifications.forEach(tag => {
            if (!this.classification_ram.has(tag)) {
                this.classification_ram.set(tag, []);
            }
            if (!this.classification_ram.get(tag)!.includes(uid)) {
                this.classification_ram.get(tag)!.push(uid);
            }
        });

        // 3. FIRE THE SOCKETS!
        this.fireSockets(uid, payload);

        classifications.forEach(tag => {
            this.fireSockets(tag, this.classification_ram.get(tag));
        });
    }

    private fireSockets(key: string, data: any) {
        if (this.memory_sockets.has(key)) {
            this.memory_sockets.get(key)!.forEach(callback => {
                try {
                    callback(data);
                } catch (err) {
                    console.error(`Socket execution failed for key ${key}:`, err);
                }
            });
        }
    }
}

// Export as a pure Singleton
export const Storage = new StorageEngineSingleton();
