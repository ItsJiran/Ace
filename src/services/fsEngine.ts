import { BaseDirectory, writeTextFile, readTextFile, exists } from '@tauri-apps/plugin-fs';


class FSEngineSingleton {
    private hasShownPermissionPopup = false;

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
