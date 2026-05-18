import getElectronAPI from './get-electron-api';
import type { FsBaseDir } from '#/schemas/fs';

async function resolveInternalAbsolutePath(fsPath: string, baseDir: FsBaseDir = 'appConfig'): Promise<string> {
    const api = getElectronAPI();
    const resolveBasePath =
        baseDir === 'appCache'
            ? api?.pathAppCacheDir
            : baseDir === 'appLocal'
              ? api?.pathAppLocalDir
              : api?.pathAppConfigDir;

    if (!resolveBasePath || !api?.pathJoin) {
        return `${baseDir}:${fsPath}`;
    }

    return await Promise.resolve(api.pathJoin(await resolveBasePath(), fsPath));
}

export default resolveInternalAbsolutePath;