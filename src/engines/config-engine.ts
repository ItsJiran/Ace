import { FSEngine } from './fs-engine';
import { KernelEngine } from './kernel-engine';
import { GlobalStateManager } from './global-state-manager';
import { DefaultConfigGeneral, DefaultConfigKeybinds } from '#/constants/config';
import type { ConfigItem, ConfigItemKeybind, ConfigStorage, ConfigStorageMap } from '#/schemas/config';
import { Engine } from './engine';

class ConfigEngineSingleton extends Engine {
    
    private storages : ConfigStorageMap = {
        general: DefaultConfigGeneral,
        keybinds: DefaultConfigKeybinds,
    }

    public readonly configGeneralMemoryUid = 'system:config_general';
    public readonly configKeybindsMemoryUid = 'system:config_keybinds';

    // + ----- Abstract Methods ---------------------------------------------------------------+

    async boot() {
        try {
            Object.keys(this.storages).forEach(( storage_key ) => {
                this.syncConfigFileToRam(storage_key);
            });
            console.log('ConfigEngine: Booted and synced from JSON.');
        } catch (error) {
            console.error('ConfigEngine: Boot failed:', error);
        }
    }

    async setupEventRoutes() {
    }

    async setupKernelSpace() {
        KernelEngine.registerSystemMemory(this.configGeneralMemoryUid, [] as ConfigItem[]);
        KernelEngine.registerSystemMemory(this.configKeybindsMemoryUid, [] as ConfigItemKeybind[]);
    }

    // + ----- API ---------------------------------------------------------------+

    public async syncConfigFileToRam(storageKey : string) {
        const storage : ConfigStorage = this.storages[storageKey]
        
        const isFileReady = await FSEngine.ensureFile(storage.file_name, storage.items);
        if (!isFileReady) {
            console.warn(`ConfigEngine: Storage file ${storage.file_name} could not be initialized. Skipping sync.`);
            return;
        }

        const fileData = await FSEngine.readFile(storage.file_name);
        if (fileData && fileData.items) {
            KernelEngine.writeMemory(storage.memory_uid, fileData.items);
            console.log(`ConfigEngine: Synced ${storageKey} config from ${storage.file_name} to RAM.`);
        } else {
            console.warn(`ConfigEngine: No valid items found in ${storage.file_name}. RAM sync skipped for ${storageKey}.`);
        }
    }

    public async syncConfigRamToFile(storageKey : string) {
        const storage : ConfigStorage = this.storages[storageKey]
        const items = KernelEngine.readMemory(storage.memory_uid) as ConfigItem[] | undefined;
        if (!items) {
            console.warn(`ConfigEngine: No items in RAM for ${storageKey}. File sync skipped.`);
            return;
        }

        const isSaved = await FSEngine.saveFile(storage.file_name, { items });
        if (isSaved) {
            console.log(`ConfigEngine: Synced ${storageKey} config from RAM to ${storage.file_name}.`);
        } else {
            console.warn(`ConfigEngine: Failed to save ${storageKey} config to file. Sync aborted.`);
        }
    }

    public getConfigItems(storageKey : string) : ConfigItem[] {
        const storage : ConfigStorage = this.storages[storageKey]
        const items = KernelEngine.readMemory(storage.memory_uid) as ConfigItem[] | undefined;
        return items ?? [];
    }
    
    public getConfigItem(storageKey : string, key: string) : ConfigItem | undefined {
        const items = this.getConfigItems(storageKey);
        return items.find(item => item.key === key);
    }

    public async updateConfigItem(storageKey : string, key: string, value: any, category?: string, description?: string) {
        const storage : ConfigStorage = this.storages[storageKey]
        const currentItems = this.getConfigItems(storageKey);
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
            nextItems.push({ key, value, category, description });
        }

        KernelEngine.writeMemory(storage.memory_uid, nextItems);
        await this.syncConfigRamToFile(storageKey);
    }    
}

export const ConfigEngine = new ConfigEngineSingleton();
