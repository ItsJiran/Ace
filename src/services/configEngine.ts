import { FSEngine } from './fsEngine';
import { Storage } from './storageEngine';
import { BASE_CONFIG_ITEMS, BASE_KEYBINDS } from '#/constants/defaults';
import type { ConfigItem } from '#/schemas/config';
import type { Keybind } from '#/schemas/keybinds';

class ConfigEngineSingleton {
    private is_booted = false;
    private config_file = 'ace.config.json';
    private keybinds_file = 'ace.keybinds.json';

    /**
     * Boot sequence for the configuration system.
     * Loads persistent data from JSON files and syncs it to Global RAM.
     */
    async boot() {
        if (this.is_booted) return;

        try {
            // 1. Ensure JSON files exist with defaults
            await FSEngine.ensureFile(this.config_file, { items: BASE_CONFIG_ITEMS });
            await FSEngine.ensureFile(this.keybinds_file, { items: BASE_KEYBINDS });

            // 2. Load and Sync Config
            const configData = await FSEngine.readFile(this.config_file);
            if (configData && configData.items) {
                this.syncConfigToRAM(configData.items);
            }

            // 3. Load and Sync Keybinds
            const keybindsData = await FSEngine.readFile(this.keybinds_file);
            if (keybindsData && keybindsData.items) {
                this.syncKeybindsToRAM(keybindsData.items);
            }

            this.is_booted = true;
            console.log('ConfigEngine: Booted and synced from JSON.');
        } catch (error) {
            console.error('ConfigEngine: Boot failed:', error);
        }
    }

    private syncConfigToRAM(items: ConfigItem[]) {
        Storage.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:config',
            payload: items,
            classifications: ['system:core']
        });
    }

    private syncKeybindsToRAM(binds: Keybind[]) {
        Storage.dispatchRAMAction({
            action: 'create_memory',
            memory_uid: 'system:keybinds',
            payload: binds,
            classifications: ['system:core']
        });
    }

    /**
     * Updates modular config locally and persists to JSON.
     */
    async saveConfigItems(items: ConfigItem[]) {
        await FSEngine.saveFile(this.config_file, { items });
        this.syncConfigToRAM(items);
    }

    /**
     * Updates keybinds locally and persists to JSON.
     */
    async saveKeybinds(binds: Keybind[]) {
        await FSEngine.saveFile(this.keybinds_file, { items: binds });
        this.syncKeybindsToRAM(binds);
    }
}

export const ConfigEngine = new ConfigEngineSingleton();
