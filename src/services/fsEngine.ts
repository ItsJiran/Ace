import { BaseDirectory, writeTextFile, readTextFile, exists } from '@tauri-apps/plugin-fs';


class FSEngineSingleton {
    /**
     * Ensures a JSON file exists in the App Data directory.
     * If not, it writes the default data.
     */
    async ensureFile(filename: string, defaultData: any) {
        try {
            const fileExists = await exists(filename, { baseDir: BaseDirectory.AppConfig });
            if (!fileExists) {
                await this.saveFile(filename, defaultData);
            }
        } catch (error) {
            console.error(`FSEngine: Failed to ensure file ${filename}:`, error);
        }
    }

    async saveFile(filename: string, data: any) {
        try {
            const content = JSON.stringify(data, null, 2);
            await writeTextFile(filename, content, { baseDir: BaseDirectory.AppConfig });
        } catch (error) {
            console.error(`FSEngine: Failed to save file ${filename}:`, error);
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
}

export const FSEngine = new FSEngineSingleton();
