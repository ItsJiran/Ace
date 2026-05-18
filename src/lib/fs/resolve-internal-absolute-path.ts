import getElectronAPI from './get-electron-api';

async function resolveInternalAbsolutePath(fsPath: string): Promise<string> {
    const api = getElectronAPI();
    if (!api?.pathAppConfigDir || !api?.pathJoin) {
        return `AppConfig:${fsPath}`;
    }

    return await Promise.resolve(api.pathJoin(await api.pathAppConfigDir(), fsPath));
}

export default resolveInternalAbsolutePath;