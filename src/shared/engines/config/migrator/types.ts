import type { ConfigFileType } from '#/shared/schemas/config';

/**
 * Shared migrator signature: accepts a raw config file payload and returns the
 * migrated (or unchanged) payload. Each migrator handles its own version chain.
 */
export type ConfigMigratorFn = (raw: ConfigFileType) => ConfigFileType;
