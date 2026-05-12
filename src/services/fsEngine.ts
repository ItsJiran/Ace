import { FsFallbackStorage } from '#/services/fs/fallbackStorage';
import { resolveAppConfigPath, resolveFsTarget } from '#/services/fs/pathResolution';
import { fsRuntimeHost } from '#/services/fs/runtimeHost';

class FSEngineSingleton {
    private hasShownPermissionPopup = false;
    private readonly fallbackStorage = new FsFallbackStorage('ace:appconfig:');

    /**
     * Ensures a directory exists in the App Data directory.
     */
    async createDirectory(path: string): Promise<boolean> {
        try {
                        const target = await resolveFsTarget(fsRuntimeHost, path);
                        const dirExists = await fsRuntimeHost.exists(target.fs_path, target.baseDir);
            if (!dirExists) {
                                await fsRuntimeHost.mkdir(target.fs_path, target.baseDir);
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
            const target = await resolveFsTarget(fsRuntimeHost, path);
            return await fsRuntimeHost.readDir(target.fs_path, target.baseDir);
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
            const target = await resolveFsTarget(fsRuntimeHost, filename);
            await fsRuntimeHost.writeTextFile(target.fs_path, content, target.baseDir);
            return true;
        } catch (error) {
            console.error(`FSEngine: Failed to write file ${filename}:`, error);
            this.showPermissionDeniedPopup(filename, error);
            const target = await resolveFsTarget(fsRuntimeHost, filename).catch(() => null);
            if (target?.isExternal) {
                return false;
            }
            const fallbackOk = this.fallbackStorage.writeRaw(filename, content);
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
    async ensureFile(filename: string, defaultData: unknown): Promise<boolean> {
        try {
            const target = await resolveFsTarget(fsRuntimeHost, filename);
            const fileExists = await fsRuntimeHost.exists(target.fs_path, target.baseDir);
            if (!fileExists) {
                return await this.saveFile(filename, defaultData);
            }
            return true;
        } catch (error) {
            console.error(`FSEngine: Failed to ensure file ${filename}:`, error);
            const target = await resolveFsTarget(fsRuntimeHost, filename).catch(() => null);
            if (target?.isExternal) {
                return false;
            }
            if (this.fallbackStorage.hasFile(filename)) {
                return true;
            }
            return await this.saveFile(filename, defaultData);
        }
    }

    async saveFile(filename: string, data: unknown): Promise<boolean> {
        const content = JSON.stringify(data, null, 2);
        try {
            const target = await resolveFsTarget(fsRuntimeHost, filename);
            await fsRuntimeHost.writeTextFile(target.fs_path, content, target.baseDir);
            return true;
        } catch (error) {
            console.error(`FSEngine: Failed to save file ${filename}:`, error);
            this.showPermissionDeniedPopup(filename, error);
            const target = await resolveFsTarget(fsRuntimeHost, filename).catch(() => null);
            if (target?.isExternal) {
                return false;
            }
            const fallbackOk = this.fallbackStorage.writeRaw(filename, content);
            if (fallbackOk) {
                console.warn(`FSEngine: save fallback to localStorage for ${filename}`);
            }
            return fallbackOk;
        }
    }

    async readFile(filename: string) {
        try {
            const target = await resolveFsTarget(fsRuntimeHost, filename);
            const content = await fsRuntimeHost.readTextFile(target.fs_path, target.baseDir);
            return JSON.parse(content);
        } catch (error) {
            console.error(`FSEngine: Failed to read file ${filename}:`, error);
            const target = await resolveFsTarget(fsRuntimeHost, filename).catch(() => null);
            if (target?.isExternal) {
                return null;
            }
            const fallbackRaw = this.fallbackStorage.readRaw(filename);
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
            const target = await resolveFsTarget(fsRuntimeHost, filename);
            return await fsRuntimeHost.readTextFile(target.fs_path, target.baseDir);
        } catch (error) {
            console.error(`FSEngine: Failed to read raw file ${filename}:`, error);
            const target = await resolveFsTarget(fsRuntimeHost, filename).catch(() => null);
            if (target?.isExternal) {
                return null;
            }
            return this.fallbackStorage.readRaw(filename);
        }
    }

    /**
     * Deletes a file from AppConfig directory.
     */
    async deleteFile(filename: string): Promise<boolean> {
        try {
            const target = await resolveFsTarget(fsRuntimeHost, filename);
            await fsRuntimeHost.remove(target.fs_path, target.baseDir);
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
            return await resolveAppConfigPath(fsRuntimeHost, filename);
        } catch {
            // Fallback when path API is unavailable (e.g. web runtime)
            return `AppConfig:${filename}`;
        }
    }

    async resolvePath(filename: string): Promise<string> {
        try {
            const target = await resolveFsTarget(fsRuntimeHost, filename);
            return target.absolute_path;
        } catch {
            return `Unknown:${filename}`;
        }
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
