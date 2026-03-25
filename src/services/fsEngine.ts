import { BaseDirectory, writeTextFile, readTextFile, exists, mkdir, readDir } from '@tauri-apps/plugin-fs';

class FSEngineSingleton {
    private hasShownPermissionPopup = false;
    private readonly fallbackPrefix = 'ace:appconfig:';

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
            const dirExists = await exists(path, { baseDir: BaseDirectory.AppConfig });
            if (!dirExists) {
                 await mkdir(path, { baseDir: BaseDirectory.AppConfig, recursive: true });
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
            return await readDir(path, { baseDir: BaseDirectory.AppConfig });
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
            await writeTextFile(filename, content, { baseDir: BaseDirectory.AppConfig });
            return true;
        } catch (error) {
            console.error(`FSEngine: Failed to write file ${filename}:`, error);
            this.showPermissionDeniedPopup(filename, error);
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
            const fileExists = await exists(filename, { baseDir: BaseDirectory.AppConfig });
            if (!fileExists) {
                return await this.saveFile(filename, defaultData);
            }
            return true;
        } catch (error) {
            console.error(`FSEngine: Failed to ensure file ${filename}:`, error);
            if (this.hasFallbackFile(filename)) {
                return true;
            }
            return await this.saveFile(filename, defaultData);
        }
    }

    async saveFile(filename: string, data: any): Promise<boolean> {
        const content = JSON.stringify(data, null, 2);
        try {
            await writeTextFile(filename, content, { baseDir: BaseDirectory.AppConfig });
            return true;
        } catch (error) {
            console.error(`FSEngine: Failed to save file ${filename}:`, error);
            this.showPermissionDeniedPopup(filename, error);
            const fallbackOk = this.writeFallbackRaw(filename, content);
            if (fallbackOk) {
                console.warn(`FSEngine: save fallback to localStorage for ${filename}`);
            }
            return fallbackOk;
        }
    }

    async readFile(filename: string) {
        try {
            const content = await readTextFile(filename, { baseDir: BaseDirectory.AppConfig });
            return JSON.parse(content);
        } catch (error) {
            console.error(`FSEngine: Failed to read file ${filename}:`, error);
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
            ].join('\n')
        );
    }
}

export const FSEngine = new FSEngineSingleton();
