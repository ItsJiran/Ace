export type FsBaseDir = 'appConfig';

export type FsDirectoryEntry = {
    name: string;
    path: string;
    isDirectory: boolean;
};

export type FSEnginePathOptions = {
    fullPath?: boolean;
};

export type FsResolvedTarget = {
    storageKey: string;
    fsPath: string;
    absolutePath: string;
    baseDir?: FsBaseDir;
    isExternal: boolean;
};

export interface FsStorageAdapter {
    exists(target: FsResolvedTarget): Promise<boolean>;
    writeTextFile(target: FsResolvedTarget, content: string): Promise<void>;
    readTextFile(target: FsResolvedTarget): Promise<string>;
    mkdir(target: FsResolvedTarget): Promise<void>;
    readDir(target: FsResolvedTarget): Promise<FsDirectoryEntry[]>;
    remove(target: FsResolvedTarget): Promise<void>;
}