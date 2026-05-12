interface ElectronAPI {
    closeWindow: () => Promise<void>;
    focusWindow: () => Promise<boolean>;
    minimizeWindow: () => Promise<void>;
    toggleDevtools: () => Promise<boolean>;
    focusDevtools: () => Promise<boolean>;
    ignoreMouseEvents: (ignore: boolean) => Promise<boolean>;
    getWindowBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
    getCursorScreenPoint: () => Promise<{ x: number; y: number }>;
    fsExists: (targetPath: string, baseDir?: 'appConfig') => Promise<boolean>;
    fsWriteTextFile: (targetPath: string, content: string, baseDir?: 'appConfig') => Promise<boolean>;
    fsReadTextFile: (targetPath: string, baseDir?: 'appConfig') => Promise<string>;
    fsMkdir: (targetPath: string, baseDir?: 'appConfig') => Promise<boolean>;
    fsReadDir: (targetPath: string, baseDir?: 'appConfig') => Promise<Array<{ name: string; path: string; isDirectory: boolean }>>;
    fsRemove: (targetPath: string, baseDir?: 'appConfig') => Promise<boolean>;
    pathAppConfigDir: () => Promise<string>;
    pathHomeDir: () => Promise<string>;
    pathJoin: (...segments: string[]) => Promise<string> | string;
    pathNormalize: (targetPath: string) => Promise<string> | string;
    syncGlobalShortcuts: (accelerators: string[]) => Promise<string[]>;
    onGlobalShortcut: (callback: (accelerator: string) => void) => () => void;
    onMouseTracking: (callback: (payload: { x: number; y: number; localX: number; localY: number; isInsideApp: boolean }) => void) => () => void;
    getPlatform: () => Promise<string>;
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
    }
}

export {};