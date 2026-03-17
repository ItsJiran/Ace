import type { RegistryPackage } from '#/schemas/registry';
import SystemPackageRegistryJson from './registry.json';

/**
 * Compatibility export: core manifest source is now `registry.json`.
 */
export const SystemPackageRegistry = SystemPackageRegistryJson as RegistryPackage;
