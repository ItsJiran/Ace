import { BaseDirectory } from '@tauri-apps/plugin-fs';
import type { FsRuntimeHost } from './runtimeHost';

const HOME_PATH_PATTERN = /^(~(?:[\\/]|$)|[a-zA-Z]:[\\/]|\\\\|\/)/;

export interface ResolvedFsTarget {
    requested_path: string;
    fs_path: string;
    absolute_path: string;
    baseDir?: BaseDirectory;
    isExternal: boolean;
}

function normalizeSeparators(value: string): string {
    return value.replace(/\\/g, '/');
}

export async function resolveAppConfigPath(host: FsRuntimeHost, filename: string): Promise<string> {
    const base = await host.appConfigDir();
    return await host.join(base, filename);
}

export async function resolveFsTarget(host: FsRuntimeHost, path: string): Promise<ResolvedFsTarget> {
    const requested_path = path.trim();
    if (!requested_path) {
        throw new Error('FSEngine: path is required');
    }

    if (!HOME_PATH_PATTERN.test(requested_path)) {
        return {
            requested_path,
            fs_path: requested_path,
            absolute_path: await resolveAppConfigPath(host, requested_path),
            baseDir: BaseDirectory.AppConfig,
            isExternal: false,
        };
    }

    const home = await host.homeDir();
    const normalizedHome = normalizeSeparators(await host.normalize(home)).replace(/\/$/, '');

    if (requested_path === '~' || requested_path.startsWith('~/') || requested_path.startsWith('~\\')) {
        const relativePath = requested_path === '~' ? '' : requested_path.slice(2);
        const absolute_path = relativePath ? await host.join(home, relativePath) : home;
        return {
            requested_path,
            fs_path: absolute_path,
            absolute_path,
            isExternal: true,
        };
    }

    const absolute_path = await host.normalize(requested_path);
    const normalizedAbsolute = normalizeSeparators(absolute_path);
    if (normalizedAbsolute !== normalizedHome && !normalizedAbsolute.startsWith(`${normalizedHome}/`)) {
        throw new Error(`FSEngine: external path must stay inside current user home: ${requested_path}`);
    }

    return {
        requested_path,
        fs_path: absolute_path,
        absolute_path,
        isExternal: true,
    };
}