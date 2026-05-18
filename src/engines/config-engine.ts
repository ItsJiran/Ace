import { FSEngine } from './fs-engine';
import { KernelEngine } from './kernel-engine';
import { DefaultConfigGeneral, DefaultConfigKeybinds } from '#/constants/config';
import { EventBus } from './event-engine';
import type {
    ConfigItem,
    ConfigItemKeybind,
    ConfigStorage,
    ConfigStorageMap,
} from '#/schemas/config';
import { Engine } from './engine';

class ConfigEngineSingleton extends Engine {
    private readonly storages: ConfigStorageMap = {
        general: DefaultConfigGeneral,
        keybinds: DefaultConfigKeybinds,
    };

    // + ----- Abstract Methods ---------------------------------------------------------------+

    async boot() {
        try {
            Object.keys(this.storages).forEach((storage_key) => {
                this.syncConfigFileToRam(storage_key);
            });
            console.log('ConfigEngine: Booted and synced from JSON.');
        } catch (error) {
            console.error('ConfigEngine: Boot failed:', error);
        }
    }

    async setupEventRoutes() {}

    async setupKernelSpace() {
        KernelEngine.registerSystemMemory(DefaultConfigGeneral.memory_uid, [] as ConfigItem[]);
        KernelEngine.registerSystemMemory(
            DefaultConfigKeybinds.memory_uid,
            [] as ConfigItemKeybind[],
        );
    }

    // + ----- API ---------------------------------------------------------------+

    public async syncConfigFileToRam(storageKey: string) {
        const storage: ConfigStorage = this.storages[storageKey];

        const isFileReady = await FSEngine.ensureFile(storage.file_name, storage.items);
        if (!isFileReady) {
            console.warn(
                `ConfigEngine: Storage file ${storage.file_name} could not be initialized. Skipping sync.`,
            );
            return;
        }

        const fileData = await FSEngine.readFile(storage.file_name);
        if (fileData && fileData.items) {
            KernelEngine.writeMemory(storage.memory_uid, fileData.items);
            console.log(
                `ConfigEngine: Synced ${storageKey} config from ${storage.file_name} to RAM.`,
            );
        } else {
            console.warn(
                `ConfigEngine: No valid items found in ${storage.file_name}. RAM sync skipped for ${storageKey}.`,
            );
        }
    }

    public async syncConfigRamToFile(storageKey: string) {
        const storage: ConfigStorage = this.storages[storageKey];
        const items = KernelEngine.readMemory(storage.memory_uid) as ConfigItem[] | undefined;
        if (!items) {
            console.warn(`ConfigEngine: No items in RAM for ${storageKey}. File sync skipped.`);
            return;
        }

        const isSaved = await FSEngine.saveFile(storage.file_name, { items });
        if (isSaved) {
            console.log(
                `ConfigEngine: Synced ${storageKey} config from RAM to ${storage.file_name}.`,
            );
        } else {
            console.warn(
                `ConfigEngine: Failed to save ${storageKey} config to file. Sync aborted.`,
            );
        }
    }

    public getConfigItems<T extends ConfigItem = ConfigItem | ConfigItemKeybind>(
        storageKey: string,
    ): T[] {
        const storage = this.storages[storageKey];
        if (!storage) return [];

        const items = KernelEngine.readMemory(storage.memory_uid) as T[] | undefined;
        return items ?? [];
    }

    public getConfigItem<T extends ConfigItem = ConfigItem | ConfigItemKeybind>(
        storageKey: string,
        key: T['key'],
    ): T | undefined {
        const items = this.getConfigItems<T>(storageKey);
        return items.find((item) => item.key === key);
    }

    public async updateConfigItem<T extends ConfigItem = ConfigItem | ConfigItemKeybind>(
        storageKey: string,
        key: T['key'],
        value: T['value'],
        category?: string,
        description?: string,
    ) {
        const storage: ConfigStorage = this.storages[storageKey];
        const currentItems = this.getConfigItems<T>(storageKey);
        const nextItems = [...currentItems];
        const existingIndex = nextItems.findIndex((item) => item.key === key);

        if (existingIndex >= 0) {
            nextItems[existingIndex] = {
                ...nextItems[existingIndex],
                value,
                category: category ?? nextItems[existingIndex].category,
                description: description ?? nextItems[existingIndex].description,
            };
        } else {
            nextItems.push({ key, value, category, description } as T);
        }

        KernelEngine.writeMemory(storage.memory_uid, nextItems);
        await this.syncConfigRamToFile(storageKey);
        
        await EventBus.emit(`system:config:${storageKey}:update`, {
            payload: {
                storageKey,
                key,
                value,
                items: nextItems,
            },
        });
    }
}

export const ConfigEngine = new ConfigEngineSingleton();
