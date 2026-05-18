import { z } from 'zod';
import { KeybindAction, KeybindCombos } from './keybinds';

export interface ConfigItem {
    key: string;
    value: any;
    category?: string;
    description?: string;
    enabled?: boolean;
}

export interface ConfigItemKeybind extends ConfigItem {
    key: KeybindAction;
    value: KeybindCombos;
}

export interface ConfigStorage<T extends ConfigItem | ConfigItemKeybind> {
    memory_uid: string;
    file_name: string;
    items: T[];
}

export interface ConfigStorageMap {
    [storageKey: string]: ConfigStorage<any>;
};
