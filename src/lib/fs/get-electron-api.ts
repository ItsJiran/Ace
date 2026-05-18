function getElectronAPI() {
    if (typeof window === 'undefined') return undefined;
    return window.electronAPI;
}

export default getElectronAPI;