import type { FsDirectoryEntry, FsResolvedTarget, FsStorageAdapter } from '#/shared/schemas/fs';

export class LocalStorageAdapter implements FsStorageAdapter {
    private readonly prefix: string;

    constructor(prefix: string) {
        this.prefix = prefix;
    }

    async exists(target: FsResolvedTarget): Promise<boolean> {
        return this.readRaw(target) !== null;
    }

    async writeTextFile(target: FsResolvedTarget, content: string): Promise<void> {
        const storage = this.getStorage();
        storage.setItem(this.key(target), content);
    }

    async readTextFile(target: FsResolvedTarget): Promise<string> {
        const raw = this.readRaw(target);
        if (raw === null) {
            throw new Error(`FSEngine: No fallback data found for ${target.storageKey}`);
        }

        return raw;
    }

    async mkdir(_target: FsResolvedTarget): Promise<void> {}

    async readDir(_target: FsResolvedTarget): Promise<FsDirectoryEntry[]> {
        return [];
    }

    async remove(target: FsResolvedTarget): Promise<void> {
        const storage = this.getStorage();
        storage.removeItem(this.key(target));
    }

    private readRaw(target: FsResolvedTarget): string | null {
        const storage = this.getStorage();
        return storage.getItem(this.key(target));
    }

    private getStorage(): Storage {
        if (typeof window === 'undefined') {
            throw new Error('FSEngine: localStorage is unavailable in this runtime.');
        }

        return window.localStorage;
    }

    private key(target: FsResolvedTarget): string {
        return `${this.prefix}${target.storageKey}`;
    }
}