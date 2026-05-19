import { getElectronAPI } from '#/shared/lib/fs';
import type { FsDirectoryEntry, FsResolvedTarget, FsStorageAdapter } from '#/shared/schemas/fs';

async function importNodeFs() {
	return await import(/* @vite-ignore */ 'node:fs/promises');
}

async function importNodePath() {
	return await import(/* @vite-ignore */ 'node:path');
}

export class FilesystemStorageAdapter implements FsStorageAdapter {
    async exists(target: FsResolvedTarget): Promise<boolean> {
        const api = getElectronAPI();
        if (api?.fsExists) {
            return await api.fsExists(target.fsPath, target.baseDir);
        }

        const fs = await importNodeFs();
        try {
            await fs.access(target.absolutePath);
            return true;
        } catch {
            return false;
        }
    }

    async writeTextFile(target: FsResolvedTarget, content: string): Promise<void> {
        const api = getElectronAPI();
        if (api?.fsWriteTextFile) {
            await api.fsWriteTextFile(target.fsPath, content, target.baseDir);
            return;
        }

        const fs = await importNodeFs();
        const path = await importNodePath();
        await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
        await fs.writeFile(target.absolutePath, String(content), 'utf8');
    }

    async readTextFile(target: FsResolvedTarget): Promise<string> {
        const api = getElectronAPI();
        if (api?.fsReadTextFile) {
            return await api.fsReadTextFile(target.fsPath, target.baseDir);
        }

        const fs = await importNodeFs();
        return await fs.readFile(target.absolutePath, 'utf8');
    }

    async mkdir(target: FsResolvedTarget): Promise<void> {
        const api = getElectronAPI();
        if (api?.fsMkdir) {
            await api.fsMkdir(target.fsPath, target.baseDir);
            return;
        }

        const fs = await importNodeFs();
        await fs.mkdir(target.absolutePath, { recursive: true });
    }

    async readDir(target: FsResolvedTarget): Promise<FsDirectoryEntry[]> {
        const api = getElectronAPI();
        if (api?.fsReadDir) {
            return await api.fsReadDir(target.fsPath, target.baseDir);
        }

        const fs = await importNodeFs();
        const path = await importNodePath();
        const entries = await fs.readdir(target.absolutePath, { withFileTypes: true });

        return entries.map((entry) => ({
            name: entry.name,
            path: path.join(target.absolutePath, entry.name),
            isDirectory: entry.isDirectory(),
        }));
    }

    async remove(target: FsResolvedTarget): Promise<void> {
        const api = getElectronAPI();
        if (api?.fsRemove) {
            await api.fsRemove(target.fsPath, target.baseDir);
            return;
        }

        const fs = await importNodeFs();
        await fs.rm(target.absolutePath, { force: true, recursive: true });
    }
}