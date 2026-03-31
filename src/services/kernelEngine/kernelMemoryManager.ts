import type { RAMInteractivity } from '#/schemas/storage';
import { ProcessRuntimeMemoryMeta, RuntimeMemoryRetentionPolicy, RuntimeMemoryScope, RuntimeMemoryState } from '#/schemas/process';
import { KernelState } from './kernelState';
import { KernelTelemetry } from './kernelTelemetry';
import { KernelProcessManager } from './kernelProcessManager';

const generateUid = () => 'mem-' + Math.random().toString(36).substring(2, 11);

function isShallowEqual(a: any, b: any): boolean {
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

const textEncoder = new TextEncoder();

export class KernelMemoryManager {
    private static notifyMemoryChanged(): void {
        for (const listener of KernelState.change_listeners) {
            try {
                listener();
            } catch (error) {
                console.error('[KernelMemoryManager] Change listener failed:', error);
            }
        }
    }

    private static writeMemoryInternal(memory_uid: string, payload: any): void {
        const existingPayload = KernelState.physical_ram.get(memory_uid);

        if (isShallowEqual(existingPayload, payload)) {
            return;
        }

        const immutablePayload = payload && typeof payload === 'object'
            ? Array.isArray(payload) ? [...payload] : { ...payload }
            : payload;

        KernelState.physical_ram.set(memory_uid, immutablePayload);
        this.notifyMemoryChanged();
    }

    private static estimatePayloadBytes(payload: unknown): number {
        if (payload == null) return 0;
        if (typeof payload === 'string') return textEncoder.encode(payload).length;
        if (typeof payload === 'number' || typeof payload === 'boolean' || typeof payload === 'bigint') {
            return textEncoder.encode(String(payload)).length;
        }
        try {
            const serialized = JSON.stringify(payload);
            if (!serialized) return 0;
            return textEncoder.encode(serialized).length;
        } catch {
            return 0;
        }
    }

    static createMemory(payload: any): string {
        const newUid = generateUid();
        this.writeMemoryInternal(newUid, payload);
        return newUid;
    }

    static setMemory(memory_uid: string, payload: any): boolean {
        if (!memory_uid) return false;
        if (!KernelState.isKernelSpaceOpen()) {
            throw new Error(`[KernelMemoryManager] setMemory is only allowed during kernel setup: ${memory_uid}`);
        }
        if (KernelState.physical_ram.has(memory_uid)) {
            throw new Error(`[KernelMemoryManager] setMemory requires a unique memory_uid: ${memory_uid}`);
        }
        this.writeMemoryInternal(memory_uid, payload);
        return true;
    }

    static writeMemory(memory_uid: string, payload: any): boolean {
        if (!memory_uid) return false;
        this.writeMemoryInternal(memory_uid, payload);
        return true;
    }

    static readMemory(memory_uid: string): any {
        if (!memory_uid) return undefined;
        return KernelState.physical_ram.get(memory_uid);
    }

    static updateMemory(memory_uid: string, payload: any): boolean {
        if (!memory_uid || !KernelState.physical_ram.has(memory_uid)) return false;

        const existingPayload = KernelState.physical_ram.get(memory_uid);
        const mergedPayload = { ...existingPayload, ...payload };

        if (isShallowEqual(existingPayload, mergedPayload)) {
            return true;
        }

        this.writeMemoryInternal(memory_uid, mergedPayload);
        return true;
    }

    static deleteMemory(memory_uid: string): boolean {
        if (!memory_uid || !KernelState.physical_ram.has(memory_uid)) return false;
        KernelState.physical_ram.delete(memory_uid);
        this.notifyMemoryChanged();
        return true;
    }

    static subscribe(memory_uid: string, callback: (data: any) => void): () => void {
        const listener = () => {
            callback(this.readMemory(memory_uid));
        };
        KernelState.change_listeners.add(listener);
        return () => {
            KernelState.change_listeners.delete(listener);
        };
    }

    static commitMemory(request: RAMInteractivity): any {
        const { action, payload } = request;

        switch (action) {
            case 'create_memory':
                return this.createMemory(payload);
            case 'set_memory':
                return this.setMemory(request.memory_uid, payload);
            case 'write_memory':
                return this.writeMemory(request.memory_uid, payload);
            case 'read_memory':
                return this.readMemory(request.memory_uid);
            case 'update_memory':
                return this.updateMemory(request.memory_uid, payload);
            case 'delete_memory':
                return this.deleteMemory(request.memory_uid);
        }
    }

    static registerSystemMemory(input: {
        memory_uid: string;
        payload: any;
    }): void {
        if (KernelState.physical_ram.has(input.memory_uid)) return;
        this.setMemory(input.memory_uid, input.payload);
        KernelTelemetry.logDebug('registerSystemMemory', { memory_uid: input.memory_uid });
    }

    static createRuntimeMemory(input: {
        owner_process_uid: string;
        memory_uid?: string;
        payload: Record<string, any>;
        owner_session_id?: string;
        memory_scope?: RuntimeMemoryScope;
        retention_policy?: RuntimeMemoryRetentionPolicy;
    }): string | null {
        const uid = input.memory_uid || ('mem-' + Math.random().toString(36).substring(2, 11));
        this.writeMemoryInternal(uid, input.payload);
        KernelTelemetry.logDebug('createRuntimeMemory', { memory_uid: uid, owner_process_uid: input.owner_process_uid });
        return uid;
    }

    static updateRuntimeMemory(input: {
        owner_process_uid: string;
        memory_uid: string;
        payload: Record<string, any>;
    }): boolean {
        this.writeMemoryInternal(input.memory_uid, input.payload);
        KernelTelemetry.logDebug('updateRuntimeMemory', { memory_uid: input.memory_uid, owner_process_uid: input.owner_process_uid });
        return true;
    }

    static getRuntimeMemoryMeta(memory_uid: string): ProcessRuntimeMemoryMeta | undefined {
        return undefined; // Stubbed for now
    }

    static enforceRuntimeMemoryOwnership(input: {
        process_uid: string;
        memory_uid: string;
    }): { allowed: boolean; reason?: string } {
        if (input.process_uid === 'system') return { allowed: true };
        return { allowed: true }; // Simplified
    }

    static getRAMStats() {
        const byKey: Array<{ memory_uid: string; approx_bytes: number; type: string; child_count: number }> = [];
        let approxTotalBytes = 0;

        for (const [memory_uid, payload] of KernelState.physical_ram.entries()) {
            const approx_bytes = this.estimatePayloadBytes(payload);
            approxTotalBytes += approx_bytes;
            byKey.push({
                memory_uid,
                approx_bytes,
                type: Array.isArray(payload) ? 'array' : typeof payload,
                child_count: 0,
            });
        }

        byKey.sort((a, b) => b.approx_bytes - a.approx_bytes);

        const listenerCount = KernelState.change_listeners.size;

        return {
            memory_entries: KernelState.physical_ram.size,
            change_listener_total: listenerCount,
            classification_entries: 0,
            socket_keys: 0,
            socket_listener_total: listenerCount,
            approx_total_bytes: approxTotalBytes,
            approx_total_kb: approxTotalBytes / 1024,
            approx_total_mb: approxTotalBytes / (1024 * 1024),
            largest_memories: byKey,
            listeners_by_key: [],
            hierarchy_links: [],
            sampled_at: Date.now(),
        };
    }
}
