import { vi } from 'vitest';
import { APP_CONFIG_ROOT_DIR } from '#/lib/fs';

type VirtualDirEntry = {
    name: string;
    path: string;
    isDirectory: boolean;
};

function createElectronAPIMock() {
    const files = new Map<string, string>();
    const directories = new Set<string>([APP_CONFIG_ROOT_DIR]);
    const appConfigDir = '/mock/app-config';
    const appCacheDir = '/mock/app-cache';
    const appLocalDir = '/mock/app-local';

    const normalizePath = (targetPath: string) =>
        targetPath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '') || '/';

    const ensureParentDirectories = (targetPath: string) => {
        const parts = normalizePath(targetPath).split('/').filter(Boolean);
        parts.slice(0, -1).reduce((current, segment) => {
            const next = current ? `${current}/${segment}` : segment;
            directories.add(next);
            return next;
        }, '');
    };

    const listEntries = (targetPath: string): VirtualDirEntry[] => {
        const normalizedTargetPath = normalizePath(targetPath);
        const prefix = normalizedTargetPath ? `${normalizedTargetPath}/` : '';
        const entryMap = new Map<string, VirtualDirEntry>();

        directories.forEach((directory) => {
            if (!directory.startsWith(prefix) || directory === normalizedTargetPath) return;

            const remainder = directory.slice(prefix.length);
            if (!remainder || remainder.includes('/')) return;

            entryMap.set(remainder, {
                name: remainder,
                path: directory,
                isDirectory: true,
            });
        });

        files.forEach((_content, filePath) => {
            if (!filePath.startsWith(prefix)) return;

            const remainder = filePath.slice(prefix.length);
            if (!remainder || remainder.includes('/')) return;

            entryMap.set(remainder, {
                name: remainder,
                path: filePath,
                isDirectory: false,
            });
        });

        return Array.from(entryMap.values()).sort((left, right) => left.name.localeCompare(right.name));
    };

    const electronAPI = {
        fsExists: vi.fn(async (targetPath: string) => {
            const normalized = normalizePath(targetPath);
            return files.has(normalized) || directories.has(normalized);
        }),
        fsWriteTextFile: vi.fn(async (targetPath: string, content: string) => {
            const normalized = normalizePath(targetPath);
            ensureParentDirectories(normalized);
            files.set(normalized, String(content));
            directories.add(normalized.split('/').slice(0, -1).join('/'));
            return true;
        }),
        fsReadTextFile: vi.fn(async (targetPath: string) => {
            const normalized = normalizePath(targetPath);
            if (!files.has(normalized)) {
                throw new Error(`ENOENT: ${normalized}`);
            }
            return files.get(normalized) as string;
        }),
        fsMkdir: vi.fn(async (targetPath: string) => {
            directories.add(normalizePath(targetPath));
            return true;
        }),
        fsReadDir: vi.fn(async (targetPath: string) => listEntries(targetPath)),
        fsRemove: vi.fn(async (targetPath: string) => {
            const normalized = normalizePath(targetPath);
            files.delete(normalized);
            Array.from(directories).forEach((directory) => {
                if (directory === normalized || directory.startsWith(`${normalized}/`)) {
                    directories.delete(directory);
                }
            });
            return true;
        }),
        pathAppConfigDir: vi.fn(async () => appConfigDir),
        pathAppCacheDir: vi.fn(async () => appCacheDir),
        pathAppLocalDir: vi.fn(async () => appLocalDir),
        pathJoin: vi.fn((...segments: string[]) => normalizePath(segments.join('/'))),
        pathNormalize: vi.fn((targetPath: string) => normalizePath(targetPath)),
    };

    return { electronAPI, files, directories, appConfigDir, appCacheDir, appLocalDir };
}

export default createElectronAPIMock;