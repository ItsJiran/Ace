
import { FilesystemStorageAdapter } from './fs/filesystem-storage';
import { LocalStorageAdapter } from './fs/local-storage';
import { APP_CONFIG_ROOT_DIR, resolveFsTarget } from '#/shared/lib/fs';
import type { FSEnginePathOptions, FsDirectoryEntry, FsResolvedTarget } from '#/shared/schemas/fs';

export type { FSEnginePathOptions } from '#/shared/schemas/fs';

class FSEngineSingleton {
    private readonly filesystemStorage = new FilesystemStorageAdapter();
    private readonly fallbackStorage = new LocalStorageAdapter(`${APP_CONFIG_ROOT_DIR}:`);

    private async execute<T>(params: {
        action: string;
        path: string;
        options?: FSEnginePathOptions;
        primary: (target: FsResolvedTarget) => Promise<T>;
        fallback?: (target: FsResolvedTarget) => Promise<T>;
        externalFailureValue: T;
    }): Promise<T> {
        let target: FsResolvedTarget | null = null;

        try {
            target = await resolveFsTarget(params.path, params.options);
            return await params.primary(target);
        } catch (error) {
            console.error(`FSEngine: Failed to ${params.action} ${params.path}:`, error);
            if (!target || target.isExternal || !params.fallback) {
                return params.externalFailureValue;
            }

            try {
                return await params.fallback(target);
            } catch (fallbackError) {
                console.error(`FSEngine: Fallback failed to ${params.action} ${params.path}:`, fallbackError);
                return params.externalFailureValue;
            }
        }
    }

    async createDirectory(path: string, options: FSEnginePathOptions = {}): Promise<boolean> {
        return await this.execute({
            action: 'create directory',
            path,
            options,
            primary: async (target) => {
                const dirExists = await this.filesystemStorage.exists(target);
                if (!dirExists) {
                    await this.filesystemStorage.mkdir(target);
                }
                return true;
            },
            externalFailureValue: false,
        });
    }

    async readDirectory(
        path: string,
        options: FSEnginePathOptions = {},
    ): Promise<FsDirectoryEntry[]> {
        return await this.execute({
            action: 'read directory',
            path,
            options,
            primary: async (target) => await this.filesystemStorage.readDir(target),
            externalFailureValue: [],
        });
    }

    async writeFile(
        filename: string,
        content: string,
        options: FSEnginePathOptions = {},
    ): Promise<boolean> {
        return await this.execute({
            action: 'write file',
            path: filename,
            options,
            primary: async (target) => {
                await this.filesystemStorage.writeTextFile(target, String(content));
                return true;
            },
            fallback: async (target) => {
                await this.fallbackStorage.writeTextFile(target, String(content));
                console.warn(`FSEngine: write fallback to localStorage for ${filename}`);
                return true;
            },
            externalFailureValue: false,
        });
    }

    async ensureFile(
        filename: string,
        defaultData: unknown,
        options: FSEnginePathOptions = {},
    ): Promise<boolean> {
        return await this.execute({
            action: 'ensure file',
            path: filename,
            options,
            primary: async (target) => {
                const fileExists = await this.filesystemStorage.exists(target);
                if (fileExists) {
                    return true;
                }

                await this.filesystemStorage.writeTextFile(target, JSON.stringify(defaultData, null, 2));
                return true;
            },
            fallback: async (target) => {
                const fileExists = await this.fallbackStorage.exists(target);
                if (!fileExists) {
                    await this.fallbackStorage.writeTextFile(target, JSON.stringify(defaultData, null, 2));
                }
                return true;
            },
            externalFailureValue: false,
        });
    }

    async saveFile(
        filename: string,
        data: unknown,
        options: FSEnginePathOptions = {},
    ): Promise<boolean> {
        return await this.writeFile(filename, JSON.stringify(data, null, 2), options);
    }

    async readFile<T = any>(
        filename: string,
        options: FSEnginePathOptions = {},
    ): Promise<T | null> {
        return await this.execute({
            action: 'read file',
            path: filename,
            options,
            primary: async (target) => JSON.parse(await this.filesystemStorage.readTextFile(target)) as T,
            fallback: async (target) => JSON.parse(await this.fallbackStorage.readTextFile(target)) as T,
            externalFailureValue: null,
        });
    }

    async readRaw(
        filename: string,
        options: FSEnginePathOptions = {},
    ): Promise<string | null> {
        return await this.execute({
            action: 'read raw file',
            path: filename,
            options,
            primary: async (target) => await this.filesystemStorage.readTextFile(target),
            fallback: async (target) => await this.fallbackStorage.readTextFile(target),
            externalFailureValue: null,
        });
    }

    async deleteFile(
        filename: string,
        options: FSEnginePathOptions = {},
    ): Promise<boolean> {
        return await this.execute({
            action: 'delete file',
            path: filename,
            options,
            primary: async (target) => {
                await this.filesystemStorage.remove(target);
                return true;
            },
            fallback: async (target) => {
                await this.fallbackStorage.remove(target);
                return true;
            },
            externalFailureValue: false,
        });
    }

    async resolveAppConfigPath(
        filename: string,
        options: FSEnginePathOptions = {},
    ): Promise<string> {
        try {
            return (await resolveFsTarget(filename, options)).absolutePath;
        } catch {
            return `AppConfig:${APP_CONFIG_ROOT_DIR}/${String(filename ?? '')}`;
        }
    }

    async resolvePath(filename: string, options: FSEnginePathOptions = {}): Promise<string> {
        try {
            return (await resolveFsTarget(filename, options)).absolutePath;
        } catch {
            return `Unknown:${String(filename ?? '')}`;
        }
    }
}

export const FSEngine = new FSEngineSingleton();
