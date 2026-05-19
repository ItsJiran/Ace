import { FSEngine } from './fs-engine';
import { KernelEngine } from './kernel-engine';
import { DefaultConfigGeneral, DefaultConfigKeybinds, DefaultConfigAI } from '#/shared/constants/config';
import { EventBus } from './event-engine';
import type {
    ConfigItemKeybindType,
    ConfigItemType,
    ConfigFileType,
    ConfigStorageMapType,
    ConfigStorageType,
} from '#/shared/schemas/config';
import { Engine } from './engine';
import { z } from 'zod';

/**
 * ConfigEngine holds two intentionally separated config representations:
 * - File storage: stored as a versioned object `{ version, config }` so that the schema map
 *   serves as the source of truth for validation, rebuilding, and future migrations.
 * - Kernel RAM: stored as an item-list so that legacy runtime APIs (`getConfigItems`,
 *   `getConfigItem`, `updateConfigItem`) remain stable for the UI and other engines.
 *
 * Main workflow:
 * 1. `setupKernelSpace()` registers empty memory for each storage.
 * 2. `boot()` invokes `syncConfigFileToRam()` for each storage.
 * 3. During the file -> RAM sync, the engine ensures the file exists with a default schema-map,
 *    reads the raw file, checks the `version`, validates the `config` payload, and if it
 *    fails, backs up the old file and rebuilds it from the latest default.
 * 4. The valid config object is then transformed into an item-list and written
 *    to kernel memory as the active runtime state.
 * 5. Upon updating an individual item, the value is validated against its corresponding schema key,
 *    RAM is updated, the entire RAM snapshot is transformed back into a `config` object
 *    to be saved to the file, and finally, an update event is published to the EventBus.
 */

class ConfigEngineSingleton extends Engine {
    private readonly storages: ConfigStorageMapType = {
        general: DefaultConfigGeneral,
        keybinds: DefaultConfigKeybinds,
        ai: DefaultConfigAI,
    };

    // + ----- Abstract Methods ---------------------------------------------------------------+

    async boot() {
        try {
            for (const storage_key of Object.keys(this.storages)) {
                await this.syncConfigFileToRam(storage_key);
            }
            this.log('Booted and synced from JSON.');
        } catch (error) {
            this.log('Boot failed:', error);
        }
    }

    async setupEventRoutes() {}

    async setupKernelSpace() {
        KernelEngine.registerSystemMemory(DefaultConfigGeneral.memory_uid, [] as ConfigItemType[]);
        KernelEngine.registerSystemMemory(
            DefaultConfigKeybinds.memory_uid,
            [] as ConfigItemKeybindType[],
        );
        KernelEngine.registerSystemMemory(DefaultConfigAI.memory_uid, [] as ConfigItemType[]);
    }

    async setupKernelTerminationHook() {}

    // + ----- API FILE AND KERNEL RAM ---------------------------------------------------------------+

    private async backupCurrentConfigFile(storage: ConfigStorageType, rawFile: string | null) {
        if (!rawFile) {
            return;
        }

        const backupFileName = `${storage.file_name}.backup.${Date.now()}.json`;
        await FSEngine.writeFile(backupFileName, rawFile);
    }

    private async rebuildConfigFile(storage: ConfigStorageType): Promise<Record<string, unknown>> {
        const defaultConfig = this.resolveDefaultConfig(storage);
        await FSEngine.saveFile(storage.file_name, {
            version: storage.version,
            config: defaultConfig,
        });
        return defaultConfig;
    }

    public async syncConfigFileToRam(storageKey: string) {
        const storage = this.storages[storageKey] as ConfigStorageType;

        const isFileReady = await FSEngine.ensureFile(storage.file_name, {
            version: storage.version,
            config: this.resolveDefaultConfig(storage),
        });
        if (!isFileReady) {
            this.log(`Storage file ${storage.file_name} could not be initialized. Skipping sync.`);
            return;
        }

        const resolvedConfig = await this.resolveConfigFromFile(storage);
        const items = this.resolveItemsFromConfig(storage, resolvedConfig);

        KernelEngine.writeMemory(storage.memory_uid, items);
        this.log(`Synced ${storageKey} config from ${storage.file_name} to RAM.`);

        this.log(
            `Current items in RAM for ${storageKey}:`,
            await KernelEngine.readMemory(storage.memory_uid),
        );
    }

    public async syncConfigRamToFile(storageKey: string) {
        const storage = this.storages[storageKey] as ConfigStorageType;
        const items = (await KernelEngine.readMemory(storage.memory_uid)) as
            | ConfigItemType[]
            | undefined;
        if (!items) {
            this.log(`No items in RAM for ${storageKey}. File sync skipped.`);
            return;
        }

        const isSaved = await FSEngine.saveFile(storage.file_name, {
            version: storage.version,
            config: this.resolveConfigFromItems(storage, items),
        });
        if (isSaved) {
            this.log(`Synced ${storageKey} config from RAM to ${storage.file_name}.`);
        } else {
            this.log(`Failed to save ${storageKey} config to file. Sync aborted.`);
        }
    }

    // + ----- API GET UPDATE ---------------------------------------------------------------+

    public getConfigItems<T extends ConfigItemType = ConfigItemType | ConfigItemKeybindType>(
        storageKey: string,
    ): T[] {
        const storage = this.storages[storageKey];
        if (!storage) return [];

        const items = KernelEngine.readMemory(storage.memory_uid) as T[] | undefined;
        return items ?? [];
    }

    public getConfigItem<T extends ConfigItemType = ConfigItemType | ConfigItemKeybindType>(
        storageKey: string,
        key: T['key'],
    ): T | undefined {
        const items = this.getConfigItems<T>(storageKey);
        return items.find((item) => item.key === key);
    }

    public async updateConfigItem<
        T extends ConfigItemType = ConfigItemType | ConfigItemKeybindType,
    >(
        storageKey: string,
        key: T['key'],
        value: T['value'],
        category?: string,
        description?: string,
    ) {
        const storage = this.storages[storageKey] as ConfigStorageType;
        const targetSchema = storage.config[String(key)];
        if (!targetSchema) {
            this.log(
                `Unknown config key ${String(key)} for storage ${storageKey}. Update skipped.`,
            );
            return;
        }

        const validatedValue = targetSchema.safeParse(value);
        if (!validatedValue.success) {
            this.log(
                `Invalid config value for ${storageKey}.${String(key)}. Update skipped.`,
                validatedValue.error,
            );
            return;
        }

        const currentItems = this.getConfigItems<T>(storageKey);
        const nextItems = [...currentItems];
        const existingIndex = nextItems.findIndex((item) => item.key === key);

        if (existingIndex >= 0) {
            nextItems[existingIndex] = {
                ...nextItems[existingIndex],
                value: validatedValue.data as T['value'],
                category: category ?? nextItems[existingIndex].category,
                description: description ?? nextItems[existingIndex].description,
            };
        } else {
            nextItems.push({
                key,
                value: validatedValue.data as T['value'],
                category,
                description,
            } as T);
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

    // + ----- UTILS ---------------------------------------------------------------+

    private resolveConfigSchema(storage: ConfigStorageType) {
        return z.object(storage.config);
    }

    private resolveDefaultConfig(storage: ConfigStorageType): Record<string, unknown> {
        return this.resolveConfigSchema(storage).parse({}) as Record<string, unknown>;
    }

    private async resolveConfigFromFile(
        storage: ConfigStorageType,
    ): Promise<Record<string, unknown>> {
        const rawFile = await FSEngine.readRaw(storage.file_name);

        if (!rawFile) {
            return await this.rebuildConfigFile(storage);
        }

        try {
            const parsedFile = JSON.parse(rawFile) as ConfigFileType;

            if (parsedFile?.version !== storage.version || !parsedFile.config) {
                throw new Error('Config version mismatch or missing config payload.');
            }

            const parsedConfig = this.resolveConfigSchema(storage).safeParse(parsedFile.config);
            if (!parsedConfig.success) {
                throw parsedConfig.error;
            }

            return parsedConfig.data as Record<string, unknown>;
        } catch (error) {
            this.log(`Failed to resolve ${storage.file_name}. Rebuilding from defaults.`, error);
            await this.backupCurrentConfigFile(storage, rawFile);
            return await this.rebuildConfigFile(storage);
        }
    }

    private resolveItemsFromConfig(
        storage: ConfigStorageType,
        config: Record<string, unknown>,
    ): ConfigItemType[] | ConfigItemKeybindType[] {
        return Object.entries(config).map(([key, value]) => ({
            key,
            value,
            description: storage.config[key]?.description,
        }));
    }

    private resolveConfigFromItems(
        storage: ConfigStorageType,
        items: ConfigItemType[],
    ): Record<string, unknown> {
        const defaults = this.resolveDefaultConfig(storage);
        const nextConfig: Record<string, unknown> = { ...defaults };

        for (const item of items) {
            nextConfig[item.key] = item.value;
        }

        const parsed = this.resolveConfigSchema(storage).safeParse(nextConfig);
        return parsed.success ? (parsed.data as Record<string, unknown>) : defaults;
    }
}

export const ConfigEngine = new ConfigEngineSingleton();
