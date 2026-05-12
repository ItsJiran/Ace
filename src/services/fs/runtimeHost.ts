import { BaseDirectory, exists, mkdir, readDir, readTextFile, remove, writeTextFile } from '@tauri-apps/plugin-fs';
import { appConfigDir, homeDir, join, normalize } from '@tauri-apps/api/path';

export class FsRuntimeHost {
    isElectronRuntime(): boolean {
        return typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined';
    }

    private toElectronBaseDir(baseDir?: BaseDirectory): 'appConfig' | undefined {
        return baseDir === BaseDirectory.AppConfig ? 'appConfig' : undefined;
    }

    private toFsOptions(baseDir?: BaseDirectory) {
        return baseDir ? { baseDir } : undefined;
    }

    async exists(path: string, baseDir?: BaseDirectory): Promise<boolean> {
        if (this.isElectronRuntime()) {
            return await window.electronAPI!.fsExists(path, this.toElectronBaseDir(baseDir));
        }

        return await exists(path, this.toFsOptions(baseDir));
    }

    async writeTextFile(path: string, content: string, baseDir?: BaseDirectory): Promise<void> {
        if (this.isElectronRuntime()) {
            await window.electronAPI!.fsWriteTextFile(path, content, this.toElectronBaseDir(baseDir));
            return;
        }

        await writeTextFile(path, content, this.toFsOptions(baseDir));
    }

    async readTextFile(path: string, baseDir?: BaseDirectory): Promise<string> {
        if (this.isElectronRuntime()) {
            return await window.electronAPI!.fsReadTextFile(path, this.toElectronBaseDir(baseDir));
        }

        return await readTextFile(path, this.toFsOptions(baseDir));
    }

    async mkdir(path: string, baseDir?: BaseDirectory): Promise<void> {
        if (this.isElectronRuntime()) {
            await window.electronAPI!.fsMkdir(path, this.toElectronBaseDir(baseDir));
            return;
        }

        await mkdir(path, { ...this.toFsOptions(baseDir), recursive: true });
    }

    async readDir(path: string, baseDir?: BaseDirectory) {
        if (this.isElectronRuntime()) {
            return await window.electronAPI!.fsReadDir(path, this.toElectronBaseDir(baseDir));
        }

        return await readDir(path, this.toFsOptions(baseDir));
    }

    async remove(path: string, baseDir?: BaseDirectory): Promise<void> {
        if (this.isElectronRuntime()) {
            await window.electronAPI!.fsRemove(path, this.toElectronBaseDir(baseDir));
            return;
        }

        await remove(path, this.toFsOptions(baseDir));
    }

    async homeDir(): Promise<string> {
        if (this.isElectronRuntime()) {
            return await window.electronAPI!.pathHomeDir();
        }

        return await homeDir();
    }

    async join(...segments: string[]): Promise<string> {
        if (this.isElectronRuntime()) {
            return await window.electronAPI!.pathJoin(...segments);
        }

        return await join(...segments);
    }

    async normalize(path: string): Promise<string> {
        if (this.isElectronRuntime()) {
            return await window.electronAPI!.pathNormalize(path);
        }

        return await normalize(path);
    }

    async appConfigDir(): Promise<string> {
        if (this.isElectronRuntime()) {
            return await window.electronAPI!.pathAppConfigDir();
        }

        return await appConfigDir();
    }
}

export const fsRuntimeHost = new FsRuntimeHost();