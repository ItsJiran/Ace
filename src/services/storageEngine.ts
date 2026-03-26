import type { RAMInteractivity } from '#/schemas/storage';

const generateUid = () => 'mem-' + Math.random().toString(36).substring(2, 11);

class StorageEngineSingleton {
    // 1. Global RAM: memory_uid => payload
    private global_ram = new Map<string, any>();

    // 2. Classification RAM: tag => [memory_uid, memory_uid]
    private classification_ram = new Map<string, string[]>();

    // 3. THE SOCKETS: key => [array of callback functions]
    private memory_sockets = new Map<string, Function[]>();

    // 4. RAM hierarchy references: parent -> children and child -> parent
    private parent_children = new Map<string, string[]>();
    private child_parent = new Map<string, string>();

    // Lightweight cache for UTF-8 encoder used by memory size estimation.
    private textEncoder = new TextEncoder();

    private isShallowEqual(a: any, b: any) {
        if (Object.is(a, b)) return true;

        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i += 1) {
                if (!Object.is(a[i], b[i])) return false;
            }
            return true;
        }

        if (
            a && b &&
            typeof a === 'object' &&
            typeof b === 'object' &&
            !Array.isArray(a) &&
            !Array.isArray(b)
        ) {
            const aKeys = Object.keys(a);
            const bKeys = Object.keys(b);
            if (aKeys.length !== bKeys.length) return false;
            for (const key of aKeys) {
                if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
                if (!Object.is(a[key], b[key])) return false;
            }
            return true;
        }

        return false;
    }

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
        const { action, memory_uid, payload, classifications, parent_memory_uid } = request;

        switch (action) {
            case 'create_memory': {
                const newUid = memory_uid || generateUid();
                this.writeMemory(newUid, payload, classifications, parent_memory_uid);
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

                // No-op guard: if payload didn't actually change and no new classifications,
                // skip write + socket fan-out to avoid unnecessary rerenders.
                const currentParent = this.child_parent.get(memory_uid);
                const parentChanged = parent_memory_uid !== undefined && parent_memory_uid !== currentParent;
                if (this.isShallowEqual(existingPayload, mergedPayload) && (!classifications || classifications.length === 0) && !parentChanged) {
                    return true;
                }

                this.writeMemory(memory_uid, mergedPayload, classifications, parent_memory_uid);
                return true;
            }

            case 'delete_memory': {
                if (!memory_uid || !this.global_ram.has(memory_uid)) return false;

                // 1. Remove from Global RAM
                this.global_ram.delete(memory_uid);

                // 1b. Remove hierarchy links (child link and all immediate child back-links)
                const parentUid = this.child_parent.get(memory_uid);
                if (parentUid) {
                    const siblings = this.parent_children.get(parentUid) || [];
                    const nextSiblings = siblings.filter((id) => id !== memory_uid);
                    if (nextSiblings.length === 0) {
                        this.parent_children.delete(parentUid);
                    } else {
                        this.parent_children.set(parentUid, nextSiblings);
                    }
                    this.child_parent.delete(memory_uid);
                }

                const children = this.parent_children.get(memory_uid) || [];
                children.forEach((childUid) => {
                    this.child_parent.delete(childUid);
                });
                this.parent_children.delete(memory_uid);

                // 2. Remove from Classification RAM
                const affectedTags: string[] = [];
                for (const [tag, uids] of this.classification_ram.entries()) {
                    if (uids.includes(memory_uid)) {
                        affectedTags.push(tag);
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

                // 4. Fire classification sockets so index subscribers update too
                affectedTags.forEach((tag) => {
                    const tagArray = this.classification_ram.get(tag);
                    this.fireSockets(tag, tagArray ? [...tagArray] : []);
                });
                return true;
            }
        }
    }

    /**
     * Internal write function that instantly fires the reactive sockets.
     */
    private writeMemory(uid: string, payload: any, classifications: string[] = [], parent_memory_uid?: string) {
        const existingPayload = this.global_ram.get(uid);

        // 1) Determine whether classification index truly changes.
        const changedTags: string[] = [];
        classifications.forEach(tag => {
            const current = this.classification_ram.get(tag) || [];
            if (!current.includes(uid)) {
                changedTags.push(tag);
            }
        });

        // 2) No-op write guard: no payload change and no new classification link.
        if (this.isShallowEqual(existingPayload, payload) && changedTags.length === 0) {
            return;
        }

        // Clone the payload to guarantee a new memory reference for React's useSyncExternalStore Object.is() comparison
        const immutablePayload = payload && typeof payload === 'object'
            ? Array.isArray(payload) ? [...payload] : { ...payload }
            : payload;

        // 1. Update Global RAM
        this.global_ram.set(uid, immutablePayload);

        // 1b. Update hierarchy links when parent is explicitly provided.
        if (parent_memory_uid !== undefined) {
            this.setParentLink(uid, parent_memory_uid);
        }

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
        this.fireSockets(uid, immutablePayload);

        changedTags.forEach(tag => {
            // Clone the tag array for immutability as well
            const tagArray = this.classification_ram.get(tag);
            this.fireSockets(tag, tagArray ? [...tagArray] : []);
        });
    }

    private setParentLink(childUid: string, parentUidRaw?: string) {
        const parentUid = typeof parentUidRaw === 'string' ? parentUidRaw.trim() : '';
        const normalizedParent = parentUid.length > 0 ? parentUid : undefined;

        const previousParent = this.child_parent.get(childUid);
        if (previousParent && previousParent !== normalizedParent) {
            const currentChildren = this.parent_children.get(previousParent) || [];
            const nextChildren = currentChildren.filter((id) => id !== childUid);
            if (nextChildren.length === 0) {
                this.parent_children.delete(previousParent);
            } else {
                this.parent_children.set(previousParent, nextChildren);
            }
        }

        if (!normalizedParent || normalizedParent === childUid) {
            this.child_parent.delete(childUid);
            return;
        }

        this.child_parent.set(childUid, normalizedParent);
        const children = this.parent_children.get(normalizedParent) || [];
        if (!children.includes(childUid)) {
            this.parent_children.set(normalizedParent, [...children, childUid]);
        }
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

    /**
     * Returns approximate memory usage of the in-process RAM store.
     * Note: this is an estimate based on UTF-8 byte size of serialized payloads.
     */
    getRAMStats() {
        const byKey: Array<{ memory_uid: string; approx_bytes: number; type: string; parent_memory_uid?: string; child_count: number }> = [];
        let approxTotalBytes = 0;

        for (const [memory_uid, payload] of this.global_ram.entries()) {
            const approx_bytes = this.estimatePayloadBytes(payload);
            approxTotalBytes += approx_bytes;
            byKey.push({
                memory_uid,
                approx_bytes,
                type: Array.isArray(payload) ? 'array' : typeof payload,
                parent_memory_uid: this.child_parent.get(memory_uid),
                child_count: (this.parent_children.get(memory_uid) || []).length,
            });
        }

        byKey.sort((a, b) => b.approx_bytes - a.approx_bytes);

        const listenerSummary = Array.from(this.memory_sockets.entries())
            .map(([key, listeners]) => ({ key, listeners: listeners.length }))
            .sort((a, b) => b.listeners - a.listeners);

        return {
            memory_entries: this.global_ram.size,
            classification_entries: this.classification_ram.size,
            socket_keys: this.memory_sockets.size,
            socket_listener_total: listenerSummary.reduce((sum, item) => sum + item.listeners, 0),
            approx_total_bytes: approxTotalBytes,
            approx_total_kb: approxTotalBytes / 1024,
            approx_total_mb: approxTotalBytes / (1024 * 1024),
            largest_memories: byKey,
            listeners_by_key: listenerSummary,
            hierarchy_links: Array.from(this.child_parent.entries()).map(([child, parent]) => ({
                child_memory_uid: child,
                parent_memory_uid: parent,
            })),
            hierarchy_roots: Array.from(this.global_ram.keys())
                .filter((uid) => !this.child_parent.has(uid))
                .map((uid) => ({
                    memory_uid: uid,
                    children: [...(this.parent_children.get(uid) || [])],
                })),
            sampled_at: Date.now(),
        };
    }

    private estimatePayloadBytes(payload: unknown) {
        if (payload == null) return 0;

        if (typeof payload === 'string') {
            return this.textEncoder.encode(payload).length;
        }

        if (typeof payload === 'number' || typeof payload === 'boolean' || typeof payload === 'bigint') {
            return this.textEncoder.encode(String(payload)).length;
        }

        try {
            const serialized = JSON.stringify(payload);
            if (!serialized) return 0;
            return this.textEncoder.encode(serialized).length;
        } catch {
            return 0;
        }
    }
}

// Export as a pure Singleton
export const StorageEngine = new StorageEngineSingleton();
