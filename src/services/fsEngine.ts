import { BaseDirectory, writeTextFile, readTextFile, exists, mkdir, readDir, remove } from '@tauri-apps/plugin-fs';
import { appConfigDir, homeDir, join, normalize } from '@tauri-apps/api/path';

// Late binding to avoid circular dep: processEngine → registryEngine → fsEngine → processEngine
type ProcessTracker = {
    track: <T>(type: string, meta: Record<string, any>, fn: (uid: string) => Promise<T>) => Promise<T>;
};
const getProcessEngine = (): ProcessTracker | null =>
    (typeof window !== 'undefined' ? (window as any).ACE?.process : null) ?? null;

class FSEngineSingleton {
    private hasShownPermissionPopup = false;
    private readonly fallbackPrefix = 'ace:appconfig:';

    private readonly homePathPattern = /^(~(?:[\\/]|$)|[a-zA-Z]:[\\/]|\\\\|\/)/;

    private toFsOptions(baseDir?: BaseDirectory) {
        return baseDir ? { baseDir } : undefined;
    }

    private normalizeSeparators(value: string): string {
        return value.replace(/\\/g, '/');
    }

    private async resolveFsTarget(path: string): Promise<{
        requested_path: string;
        fs_path: string;
        absolute_path: string;
        baseDir?: BaseDirectory;
        isExternal: boolean;
    }> {
        const requested_path = path.trim();
        if (!requested_path) {
            throw new Error('FSEngine: path is required');
        }

        if (!this.homePathPattern.test(requested_path)) {
            return {
                requested_path,
                fs_path: requested_path,
                absolute_path: await this.resolveAppConfigPath(requested_path),
                baseDir: BaseDirectory.AppConfig,
                isExternal: false,
            };
        }

        const home = await homeDir();
        const normalizedHome = this.normalizeSeparators(await normalize(home)).replace(/\/$/, '');

        if (requested_path === '~' || requested_path.startsWith('~/') || requested_path.startsWith('~\\')) {
            const relativePath = requested_path === '~' ? '' : requested_path.slice(2);
            const absolute_path = relativePath ? await join(home, relativePath) : home;
            return {
                requested_path,
                fs_path: absolute_path,
                absolute_path,
                isExternal: true,
            };
        }

        const absolute_path = await normalize(requested_path);
        const normalizedAbsolute = this.normalizeSeparators(absolute_path);
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

    private getFallbackKey(filename: string): string {
        return `${this.fallbackPrefix}${filename}`;
    }

    private readFallbackRaw(filename: string): string | null {
        if (typeof window === 'undefined' || !window.localStorage) return null;
        try {
            return window.localStorage.getItem(this.getFallbackKey(filename));
        } catch {
            return null;
        }
    }

    private writeFallbackRaw(filename: string, content: string): boolean {
        if (typeof window === 'undefined' || !window.localStorage) return false;
        try {
            window.localStorage.setItem(this.getFallbackKey(filename), content);
            return true;
        } catch {
            return false;
        }
    }

    private hasFallbackFile(filename: string): boolean {
        return this.readFallbackRaw(filename) !== null;
    }

    /**
     * Ensures a directory exists in the App Data directory.
     */
    async createDirectory(path: string): Promise<boolean> {
        try {
            const target = await this.resolveFsTarget(path);
            const dirExists = await exists(target.fs_path, this.toFsOptions(target.baseDir));
            if (!dirExists) {
                 await mkdir(target.fs_path, { ...this.toFsOptions(target.baseDir), recursive: true });
            }
            return true;
        } catch (error) {
            console.error(`FSEngine: Failed to create directory ${path}:`, error);
            return false;
        }
    }

    /**
     * Reads the contents of a directory.
     */
    async readDirectory(path: string) {
        try {
            const target = await this.resolveFsTarget(path);
            return await readDir(target.fs_path, this.toFsOptions(target.baseDir));
        } catch (error) {
            console.error(`FSEngine: Failed to read directory ${path}:`, error);
            return [];
        }
    }

    /**
     * Raw write to file (text).
     */
    async writeFile(filename: string, content: string): Promise<boolean> {
        try {
            const target = await this.resolveFsTarget(filename);
            await writeTextFile(target.fs_path, content, this.toFsOptions(target.baseDir));
            return true;
        } catch (error) {
            console.error(`FSEngine: Failed to write file ${filename}:`, error);
            this.showPermissionDeniedPopup(filename, error);
            const target = await this.resolveFsTarget(filename).catch(() => null);
            if (target?.isExternal) {
                return false;
            }
            // Dev/runtime fallback (non-Tauri or denied capability)
            const fallbackOk = this.writeFallbackRaw(filename, content);
            if (fallbackOk) {
                console.warn(`FSEngine: write fallback to localStorage for ${filename}`);
            }
            return fallbackOk;
        }
    }

    /**
     * Ensures a JSON file exists in the App Data directory.
     * If not, it writes the default data.
     */
    async ensureFile(filename: string, defaultData: any): Promise<boolean> {
        try {
            const target = await this.resolveFsTarget(filename);
            const fileExists = await exists(target.fs_path, this.toFsOptions(target.baseDir));
            if (!fileExists) {
                return await this.saveFile(filename, defaultData);
            }
            return true;
        } catch (error) {
            console.error(`FSEngine: Failed to ensure file ${filename}:`, error);
            const target = await this.resolveFsTarget(filename).catch(() => null);
            if (target?.isExternal) {
                return false;
            }
            if (this.hasFallbackFile(filename)) {
                return true;
            }
            return await this.saveFile(filename, defaultData);
        }
    }

    async saveFile(filename: string, data: any): Promise<boolean> {
        const content = JSON.stringify(data, null, 2);
        try {
            const target = await this.resolveFsTarget(filename);
            await writeTextFile(target.fs_path, content, this.toFsOptions(target.baseDir));
            return true;
        } catch (error) {
            console.error(`FSEngine: Failed to save file ${filename}:`, error);
            this.showPermissionDeniedPopup(filename, error);
            const target = await this.resolveFsTarget(filename).catch(() => null);
            if (target?.isExternal) {
                return false;
            }
            const fallbackOk = this.writeFallbackRaw(filename, content);
            if (fallbackOk) {
                console.warn(`FSEngine: save fallback to localStorage for ${filename}`);
            }
            return fallbackOk;
        }
    }

    async readFile(filename: string) {
        try {
            const target = await this.resolveFsTarget(filename);
            const content = await readTextFile(target.fs_path, this.toFsOptions(target.baseDir));
            return JSON.parse(content);
        } catch (error) {
            console.error(`FSEngine: Failed to read file ${filename}:`, error);
            const target = await this.resolveFsTarget(filename).catch(() => null);
            if (target?.isExternal) {
                return null;
            }
            const fallbackRaw = this.readFallbackRaw(filename);
            if (fallbackRaw !== null) {
                try {
                    return JSON.parse(fallbackRaw);
                } catch (fallbackError) {
                    console.error(`FSEngine: Failed to parse fallback file ${filename}:`, fallbackError);
                }
            }
            return null;
        }
    }

    /**
     * Reads raw text from a file in AppConfig directory (no JSON parsing).
     */
    async readRaw(filename: string): Promise<string | null> {
        try {
            const target = await this.resolveFsTarget(filename);
            return await readTextFile(target.fs_path, this.toFsOptions(target.baseDir));
        } catch (error) {
            console.error(`FSEngine: Failed to read raw file ${filename}:`, error);
            const target = await this.resolveFsTarget(filename).catch(() => null);
            if (target?.isExternal) {
                return null;
            }
            return this.readFallbackRaw(filename);
        }
    }

    /**
     * Deletes a file from AppConfig directory.
     */
    async deleteFile(filename: string): Promise<boolean> {
        try {
            const target = await this.resolveFsTarget(filename);
            await remove(target.fs_path, this.toFsOptions(target.baseDir));
            return true;
        } catch (error) {
            console.error(`FSEngine: Failed to delete file ${filename}:`, error);
            return false;
        }
    }

    /**
     * Resolves a relative AppConfig path to an absolute OS path.
     * Useful for diagnostics and tool outputs so users know exact write location.
     */
    async resolveAppConfigPath(filename: string): Promise<string> {
        try {
            const base = await appConfigDir();
            return await join(base, filename);
        } catch {
            // Fallback when path API is unavailable (e.g. web runtime)
            return `AppConfig:${filename}`;
        }
    }

    async resolvePath(filename: string): Promise<string> {
        try {
            const target = await this.resolveFsTarget(filename);
            return target.absolute_path;
        } catch {
            return `Unknown:${filename}`;
        }
    }

    /**
     * Wrapped variants: run a file operation as a tracked ProcessEngine record.
     * Useful when callers want process-level observability.
     */
    async trackedRead(filename: string): Promise<ReturnType<FSEngineSingleton['readFile']>> {
        const pe = getProcessEngine();
        if (!pe) return this.readFile(filename);
        return pe.track('fs:read_file', { filename }, () => this.readFile(filename));
    }

    async trackedWrite(filename: string, content: string): Promise<boolean> {
        const pe = getProcessEngine();
        if (!pe) return this.writeFile(filename, content);
        return pe.track('fs:write_file', { filename }, () => this.writeFile(filename, content));
    }

    async trackedSave(filename: string, data: unknown): Promise<boolean> {
        const pe = getProcessEngine();
        if (!pe) return this.saveFile(filename, data);
        return pe.track('fs:save_file', { filename }, () => this.saveFile(filename, data));
    }

    private showPermissionDeniedPopup(filename: string, error: unknown) {
        const message = String(error ?? 'unknown error').toLowerCase();
        const isPermissionError =
            message.includes('not allowed') ||
            message.includes('permission') ||
            message.includes('fs.write_text_file') ||
            message.includes('fs.read_dir') ||
            message.includes('fs.read_text_file');

        if (!isPermissionError || this.hasShownPermissionPopup) {
            return;
        }

        this.hasShownPermissionPopup = true;

        if (typeof window === 'undefined' || typeof window.alert !== 'function') {
            return;
        }

        window.alert(
            [
                'Config save blocked by Tauri FS permission.',
                `Failed file: ${filename}`,
                'Action: restart app after capability update.',
                'If this persists, verify src-tauri/capabilities/default.json includes:',
                '- fs:allow-read-dir',
                '- fs:allow-read-file',
                '- fs:allow-write-file',
                '- fs:allow-appconfig-read',
                '- fs:allow-appconfig-write',
                '- fs:scope-appconfig-recursive',
                '- fs:allow-home-read-recursive',
                '- fs:allow-home-write-recursive',
            ].join('\n')
        );
    }
}

export const FSEngine = new FSEngineSingleton();
