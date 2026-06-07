import {
    DefaultConfigAI,
    DefaultConfigGeneral,
    DefaultConfigKeybinds,
} from '#/shared/constants/config';
import {
    migrateAIConfig,
    migrateGeneralConfig,
    migrateKeybindConfig,
} from './migrator';
import type { ConfigMigratorFn } from './migrator';

/**
 * Maps each config file name to its dedicated migrator function.
 * ConfigEngine can use this to auto-migrate stale files on boot.
 */
export const CONFIG_MIGRATOR_MAP: Record<string, ConfigMigratorFn> = {
    [DefaultConfigAI.file_name]: migrateAIConfig,
    [DefaultConfigGeneral.file_name]: migrateGeneralConfig,
    [DefaultConfigKeybinds.file_name]: migrateKeybindConfig,
} as const;
