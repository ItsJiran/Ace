import type { ConfigFileType } from '#/shared/schemas/config';
import type { ConfigMigratorFn } from './types';

/**
 * General Config Migrator
 *
 * Version chain:
 *   0.0.0  —  Current; no migrations needed yet.
 */

const migrateGeneralConfig: ConfigMigratorFn = (raw: ConfigFileType): ConfigFileType => {
    // Latest version — no-op; add migrations here when schema changes.
    return raw;
};

export default migrateGeneralConfig;
