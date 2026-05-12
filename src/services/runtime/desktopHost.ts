export function isElectronRuntime(): boolean {
    return typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined';
}

export async function closeCurrentHostWindow(): Promise<void> {
    if (isElectronRuntime()) {
        await window.electronAPI?.closeWindow();
        return;
    }

    window.close();
}

export async function focusHostWindow(): Promise<void> {
    if (isElectronRuntime()) {
        await window.electronAPI?.focusWindow();
        return;
    }

    window.focus();
}

export async function openHostDevtools(): Promise<void> {
    if (isElectronRuntime()) {
        await window.electronAPI?.toggleDevtools();
        return;
    }
}

export async function focusHostDevtools(): Promise<void> {
    if (isElectronRuntime()) {
        await window.electronAPI?.focusDevtools();
        return;
    }
}