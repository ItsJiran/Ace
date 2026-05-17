import { FSEngine } from './fs-engine';
import { KernelEngine } from './kernel-engine';
import { GlobalStateManager } from './global-state-manager';
import { DefaultConfigGeneral, DefaultConfigKeybinds } from '#/constants/config';
import type { ConfigItem, ConfigStorage, ConfigStorageMap } from '#/schemas/config';

class ConfigEngineSingleton {
    private is_booted = false;
    
    private storages : ConfigStorageMap = {
        general: DefaultConfigGeneral,
        keybinds: DefaultConfigKeybinds,
    }

    private config_file = 'ace.config.json';
    public readonly configMemoryUid = 'system:config';

    private keybinds_file = 'ace.keybinds.json';
    public readonly keybindsMemoryUid = 'system:keybinds';

    setupKernelSpace() {
        KernelEngine.registerSystemMemory(this.configMemoryUid, [] as ConfigItem[]);
        KernelEngine.registerSystemMemory(this.keybindsMemoryUid, [] as Keybind[]);
    }

    /**
     * Boot sequence for the configuration system.
     * Loads persistent data from JSON files and syncs it to Global RAM.
     */
    async boot() {
        if (this.is_booted) return;

        try {
            // 1. Ensure JSON files exist with defaults
            const configFileReady = await FSEngine.ensureFile(this.config_file, { items: BASE_CONFIG_ITEMS });
            const keybindsFileReady = await FSEngine.ensureFile(this.keybinds_file, { items: BASE_KEYBINDS });

            if (!configFileReady || !keybindsFileReady) {
                console.warn('ConfigEngine: One or more config files could not be initialized. Running in RAM-only fallback mode.');
            }

            // 2. Load and Sync Config
            const configData = await FSEngine.readFile(this.config_file);
            if (configData && configData.items) {
                this.syncConfigToRAM(configData.items);
            }

            // 3. Load and Sync Keybinds
            const keybindsData = await FSEngine.readFile(this.keybinds_file);
            const keybindItems = this.normalizeKeybindItems(keybindsData?.items);
            this.syncKeybindsToRAM(keybindItems);

            const rawItems = Array.isArray(keybindsData?.items) ? keybindsData.items : [];

            // Rewrite when persisted file is empty/invalid OR requires migration.
            if (
                !Array.isArray(keybindsData?.items) ||
                keybindsData.items.length === 0 ||
                this.needsKeybindRewrite(rawItems, keybindItems)
            ) {
                await FSEngine.saveFile(this.keybinds_file, { items: keybindItems });
            }

            this.is_booted = true;
            console.log('ConfigEngine: Booted and synced from JSON.');
        } catch (error) {
            console.error('ConfigEngine: Boot failed:', error);
        }
    }

    // + ----- API ---------------------------------------------------------------+

    public async syncConfigFileToRam(storageKey : string) {
        const storage : ConfigStorage = this.storages[storageKey]
        
        const isFileReady = await FSEngine.ensureFile(storage.file_name, { items: storage.items });
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

    public getConfigItems(storageKey : string) : ConfigItem[] {
        const storage : ConfigStorage = this.storages[storageKey]
        const items = KernelEngine.readMemory(storage.memory_uid) as ConfigItem[] | undefined;
        return items ?? [];
    }
    
    public getConfigItem(storageKey : string, key: string) : ConfigItem | undefined {
        const items = this.getConfigItems(storageKey);
        return items.find(item => item.key === key);
    }

    

    // private normalizeKeybindItems(rawItems: unknown): Keybind[] {
    //     if (!Array.isArray(rawItems) || rawItems.length === 0) {
    //         return [...BASE_KEYBINDS];
    //     }

    //     // Keep only minimally valid keybind-like objects to prevent runtime crashes.
    //     const normalized = rawItems.filter((item: any) => {
    //         return Boolean(
    //             item &&
    //             typeof item.keybind_uid === 'string' &&
    //             typeof item.shortcut === 'string' &&
    //             item.intent &&
    //             item.intent.event_type === 'interaction' &&
    //             typeof item.intent.action === 'string' &&
    //             item.intent.payload &&
    //             typeof item.intent.payload === 'object'
    //         );
    //     }) as Keybind[];

    //     const migrated = normalized.map((bind) => {
    //         // Linux desktop environments often reserve Ctrl+Alt+Shift+G.
    //         // Migrate old default to a safer key so global shortcut can be registered.
    //         if (
    //             bind.keybind_uid === 'window.disable_mouse_focus' &&
    //             bind.shortcut.replace(/\s+/g, '').toLowerCase() === 'commandorcontrol+alt+shift+g'
    //         ) {
    //             return {
    //                 ...bind,
    //                 shortcut: 'CommandOrControl+Alt+Shift+H',
    //             };
    //         }

    //         return bind;
    //     });

    //     const baseByUid = new Map(BASE_KEYBINDS.map((bind) => [bind.keybind_uid, bind] as const));
    //     const merged: Keybind[] = migrated.map((bind) => {
    //         const base = baseByUid.get(bind.keybind_uid);
    //         if (!base) return bind;

    //         const shortcut = String(bind.shortcut ?? '').trim();
    //         const isMalformed = shortcut.length < 3 || !shortcut.includes('+');
    //         if (isMalformed) {
    //             return {
    //                 ...bind,
    //                 shortcut: base.shortcut,
    //             };
    //         }

    //         return bind;
    //     });

    //     for (const [uid, base] of baseByUid) {
    //         const exists = merged.some((bind) => bind.keybind_uid === uid);
    //         if (!exists) {
    //             merged.push({ ...base });
    //         }
    //     }

    //     return merged.length > 0 ? merged : [...BASE_KEYBINDS];
    // }

    // private needsKeybindRewrite(rawItems: any[], normalizedItems: Keybind[]) {
    //     if (rawItems.length !== normalizedItems.length) {
    //         return true;
    //     }

    //     const rawByUid = new Map<string, any>();
    //     for (const item of rawItems) {
    //         if (item && typeof item.keybind_uid === 'string') {
    //             rawByUid.set(item.keybind_uid, item);
    //         }
    //     }

    //     for (const normalized of normalizedItems) {
    //         const raw = rawByUid.get(normalized.keybind_uid);
    //         if (!raw) return true;

    //         if ((raw.shortcut ?? '') !== normalized.shortcut) return true;
    //         if (Boolean(raw.enabled) !== Boolean(normalized.enabled)) return true;
    //         if ((raw.intent?.sub_action ?? '') !== (normalized.intent?.sub_action ?? '')) return true;
    //     }

    //     return false;
    // }

    // private syncConfigToRAM(items: ConfigItem[]) {
    //     KernelEngine.writeMemory(this.configMemoryUid, items);

    //     GlobalStateManager.setActiveConfigItems(items);
    // }

    // private syncKeybindsToRAM(binds: Keybind[]) {
    //     KernelEngine.writeMemory(this.keybindsMemoryUid, binds);

    //     GlobalStateManager.setActiveKeybinds(binds.filter(bind => bind.enabled));
    // }

    // /**
    //  * Updates modular config locally and persists to JSON.
    //  */
    // async saveConfigItems(items: ConfigItem[]): Promise<boolean> {
    //     const isSaved = await FSEngine.saveFile(this.config_file, { items });
    //     if (!isSaved) {
    //         console.warn('ConfigEngine: Skipped RAM config sync because file persistence failed.');
    //         return false;
    //     }

    //     this.syncConfigToRAM(items);
    //     return true;
    // }

    // async updateConfigItem(key: string, value: any, category?: string, description?: string) {
    //     const currentItems = (KernelEngine.readMemory(this.configMemoryUid) as ConfigItem[] | undefined) || [];
    //     const nextItems = [...currentItems];
    //     const existingIndex = nextItems.findIndex((item) => item.key === key);

    //     if (existingIndex >= 0) {
    //         nextItems[existingIndex] = {
    //             ...nextItems[existingIndex],
    //             value,
    //             category: category ?? nextItems[existingIndex].category,
    //             description: description ?? nextItems[existingIndex].description,
    //         };
    //     } else {
    //         nextItems.push({ key, value, category, description });
    //     }

    //     return await this.saveConfigItems(nextItems);
    // }

    // /**
    //  * Updates keybinds locally and persists to JSON.
    //  */
    // async saveKeybinds(binds: Keybind[]): Promise<boolean> {
    //     const isSaved = await FSEngine.saveFile(this.keybinds_file, { items: binds });
    //     if (!isSaved) {
    //         console.warn('ConfigEngine: Skipped RAM keybind sync because file persistence failed.');
    //         return false;
    //     }

    //     this.syncKeybindsToRAM(binds);
    //     return true;
    // }
}

export const ConfigEngine = new ConfigEngineSingleton();
