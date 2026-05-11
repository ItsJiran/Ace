interface ElectronAPI {
    closeWindow: () => Promise<void>;
    focusWindow: () => Promise<boolean>;
    minimizeWindow: () => Promise<void>;
    toggleDevtools: () => Promise<boolean>;
    getWindowBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
    getCursorScreenPoint: () => Promise<{ x: number; y: number }>;
    syncGlobalShortcuts: (accelerators: string[]) => Promise<string[]>;
    onGlobalShortcut: (callback: (accelerator: string) => void) => () => void;
    getPlatform: () => Promise<string>;
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}

export {};