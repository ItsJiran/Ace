interface ElectronAPI {
    closeWindow: () => Promise<void>;
    focusWindow: () => Promise<boolean>;
    minimizeWindow: () => Promise<void>;
    toggleDevtools: () => Promise<boolean>;
    focusDevtools: () => Promise<boolean>;
    ignoreMouseEvents: (ignore: boolean) => Promise<boolean>;
    getWindowBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
    getCursorScreenPoint: () => Promise<{ x: number; y: number }>;
    fsExists: (targetPath: string, baseDir?: 'appConfig' | 'appCache' | 'appLocal') => Promise<boolean>;
    fsWriteTextFile: (targetPath: string, content: string, baseDir?: 'appConfig' | 'appCache' | 'appLocal') => Promise<boolean>;
    fsReadTextFile: (targetPath: string, baseDir?: 'appConfig' | 'appCache' | 'appLocal') => Promise<string>;
    fsMkdir: (targetPath: string, baseDir?: 'appConfig' | 'appCache' | 'appLocal') => Promise<boolean>;
    fsReadDir: (targetPath: string, baseDir?: 'appConfig' | 'appCache' | 'appLocal') => Promise<Array<{ name: string; path: string; isDirectory: boolean }>>;
    fsRemove: (targetPath: string, baseDir?: 'appConfig' | 'appCache' | 'appLocal') => Promise<boolean>;
    pathAppConfigDir: () => Promise<string>;
    pathAppCacheDir: () => Promise<string>;
    pathAppLocalDir: () => Promise<string>;
    pathHomeDir: () => Promise<string>;
    pathJoin: (...segments: string[]) => Promise<string> | string;
    pathNormalize: (targetPath: string) => Promise<string> | string;
    syncGlobalShortcuts: (accelerators: string[]) => Promise<string[]>;
    onGlobalShortcut: (callback: (accelerator: string) => void) => () => void;
    onMouseTracking: (callback: (payload: { x: number; y: number; localX: number; localY: number; phase: 'move' | 'down' | 'up'; isInsideApp: boolean }) => void) => () => void;
    onGlobalKeyboard: (callback: (payload: { type: 'keydown' | 'keyup'; keycode: number; rawcode: number; code: string | null; altKey: boolean; ctrlKey: boolean; shiftKey: boolean; metaKey: boolean }) => void) => () => void;
    getPlatform: () => Promise<string>;
    quitApp: () => Promise<boolean>;
    backgroundStatus: () => Promise<{ active: boolean; runtime_mode: string; pid: number | null }>;
    backgroundInvoke: (method: string, payload?: Record<string, unknown>) => Promise<unknown>;
    backgroundFetchModels: (provider: string) => Promise<string[]>;
    backgroundSyncModels: (provider: string) => Promise<string[]>;
    backgroundCreateThread: (initialState?: Record<string, unknown>) => Promise<{ thread_id: string; checkpoint_id?: string; model?: string; provider?: string; apiKey?: string }>;
    backgroundReadThread: (threadUid: string) => Promise<unknown>;
    backgroundSyncThread: (threadUid: string, thread?: Record<string, unknown>) => Promise<string>;
    backgroundDeleteThread: (threadUid: string) => Promise<boolean>;
    onBackgroundAIStreamEvent: (callback: (payload: import('#/shared/schemas/ai').BackgroundAIStreamEventPayloadType) => void) => () => void;
}

interface EnvVariablesAPI {
    get: (key: string) => Promise<string | null> | string | null;
    keys: () => string[];
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI;
        envVariables?: EnvVariablesAPI;
    }
}

export {};