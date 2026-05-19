import getElectronAPI from './get-electron-api';
import type { FsBaseDir } from '#/shared/schemas/fs';

async function importNodePath() {
    return await import(/* @vite-ignore */ 'node:path');
}

async function importNodeOs() {
    return await import(/* @vite-ignore */ 'node:os');
}

async function resolveNodeBaseDir(baseDir: FsBaseDir): Promise<string> {
    const path = await importNodePath();
    const os = await importNodeOs();
    const homeDir = os.homedir();

    if (baseDir === 'appCache') {
        return process.env.XDG_CACHE_HOME || path.join(homeDir, '.cache');
    }

    if (baseDir === 'appLocal') {
        return process.env.XDG_DATA_HOME || path.join(homeDir, '.local', 'share');
    }

    return process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config');
}

async function resolveInternalAbsolutePath(fsPath: string, baseDir: FsBaseDir = 'appConfig'): Promise<string> {
    const api = getElectronAPI();
    const resolveBasePath =
        baseDir === 'appCache'
            ? api?.pathAppCacheDir
            : baseDir === 'appLocal'
              ? api?.pathAppLocalDir
              : api?.pathAppConfigDir;

    if (!resolveBasePath || !api?.pathJoin) {
        if (typeof window === 'undefined') {
            const path = await importNodePath();
            return path.join(await resolveNodeBaseDir(baseDir), fsPath);
        }

        return `${baseDir}:${fsPath}`;
    }

    return await Promise.resolve(api.pathJoin(await resolveBasePath(), fsPath));
}

export default resolveInternalAbsolutePath;