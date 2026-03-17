import type { RegistryPackage } from '#/schemas/registry';
import SystemDevRegistryJson from './registry.json';

/**
 * Compatibility export: dev package manifest source is `registry.json`.
 * This package is excluded from production builds.
 */
export const SystemDevPackageRegistry = SystemDevRegistryJson as RegistryPackage;
