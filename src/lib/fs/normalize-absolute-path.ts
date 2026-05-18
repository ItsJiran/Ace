import getElectronAPI from './get-electron-api';

async function normalizeAbsolutePath(targetPath: string): Promise<string> {
    const api = getElectronAPI();
    if (!api?.pathNormalize) {
        return targetPath;
    }

    return await Promise.resolve(api.pathNormalize(targetPath));
}

export default normalizeAbsolutePath;