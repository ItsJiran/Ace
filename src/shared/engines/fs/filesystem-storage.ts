import { getElectronAPIOrThrow } from '#/shared/lib/fs';
import type { FsDirectoryEntry, FsResolvedTarget, FsStorageAdapter } from '#/shared/schemas/fs';

export class FilesystemStorageAdapter implements FsStorageAdapter {
    async exists(target: FsResolvedTarget): Promise<boolean> {
        const api = getElectronAPIOrThrow('fsExists');
        return await api.fsExists(target.fsPath, target.baseDir);
    }

    async writeTextFile(target: FsResolvedTarget, content: string): Promise<void> {
        const api = getElectronAPIOrThrow('fsWriteTextFile');
        await api.fsWriteTextFile(target.fsPath, content, target.baseDir);
    }

    async readTextFile(target: FsResolvedTarget): Promise<string> {
        const api =  getElectronAPIOrThrow('fsReadTextFile');
        return await api.fsReadTextFile(target.fsPath, target.baseDir);
    }

    async mkdir(target: FsResolvedTarget): Promise<void> {
        const api = getElectronAPIOrThrow('fsMkdir');
        await api.fsMkdir(target.fsPath, target.baseDir);
    }

    async readDir(target: FsResolvedTarget): Promise<FsDirectoryEntry[]> {
        const api = getElectronAPIOrThrow('fsReadDir');
        return await api.fsReadDir(target.fsPath, target.baseDir);
    }

    async remove(target: FsResolvedTarget): Promise<void> {
        const api = getElectronAPIOrThrow('fsRemove');
        await api.fsRemove(target.fsPath, target.baseDir);
    }
}