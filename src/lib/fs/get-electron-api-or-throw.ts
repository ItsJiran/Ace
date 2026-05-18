import getElectronAPI from './get-electron-api';

function createMissingElectronAPIError(method: string) {
    return new Error(`FSEngine: electronAPI.${method} is unavailable in this runtime.`);
}

function getElectronAPIOrThrow(method: string) {
    const api = getElectronAPI();
    if (!api) {
        throw createMissingElectronAPIError(method);
    }

    return api;
}

export default getElectronAPIOrThrow;