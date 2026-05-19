import getElectronAPI from './get-electron-api';

async function importNodePath() {
    return await import(/* @vite-ignore */ 'node:path');
}

async function normalizeAbsolutePath(targetPath: string): Promise<string> {
    const api = getElectronAPI();
    if (!api?.pathNormalize) {
        if (typeof window === 'undefined') {
            const path = await importNodePath();
            return path.normalize(String(targetPath || ''));
        }

        return targetPath;
    }

    return await Promise.resolve(api.pathNormalize(targetPath));
}

export default normalizeAbsolutePath;