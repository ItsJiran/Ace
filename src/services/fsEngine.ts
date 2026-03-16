import { BaseDirectory, writeTextFile, readTextFile, exists, mkdir, readDir } from '@tauri-apps/plugin-fs';

class FSEngineSingleton {
    private hasShownPermissionPopup = false;

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
            return false;
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
            return false;
        }
    }

    async saveFile(filename: string, data: any): Promise<boolean> {
        try {
            const content = JSON.stringify(data, null, 2);
            await writeTextFile(filename, content, { baseDir: BaseDirectory.AppConfig });
            return true;
        } catch (error) {
            console.error(`FSEngine: Failed to save file ${filename}:`, error);
            this.showPermissionDeniedPopup(filename, error);
            return false;
        }
    }

    async readFile(filename: string) {
        try {
            const content = await readTextFile(filename, { baseDir: BaseDirectory.AppConfig });
            return JSON.parse(content);
        } catch (error) {
            console.error(`FSEngine: Failed to read file ${filename}:`, error);
            return null;
        }
    }

    private showPermissionDeniedPopup(filename: string, error: unknown) {
        const message = String(error ?? 'unknown error').toLowerCase();
        const isPermissionError =
            message.includes('not allowed') ||
            message.includes('permission') ||
            message.includes('fs.write_text_file');

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
                '- fs:allow-appconfig-read',
                '- fs:allow-appconfig-write',
            ].join('\n')
        );
    }
}

export const FSEngine = new FSEngineSingleton();
