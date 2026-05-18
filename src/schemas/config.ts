import { z } from 'zod';
import { KeybindActionType, KeybindCombosType } from './keybinds';

export interface ConfigItem {
    key: string;
    value: any;
    category?: string;
    description?: string;
    enabled?: boolean;
}

export interface ConfigItemKeybind extends ConfigItem {
    key: KeybindActionType;
    value: KeybindCombosType;
}

export interface ConfigStorage<T = ConfigItem | ConfigItemKeybind> { 
    memory_uid: string;
    file_name: string;
    items: T[];
}

export interface ConfigStorageMap {
    [storageKey: string]: ConfigStorage<any>;
};
