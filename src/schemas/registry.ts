import { z } from 'zod';

/**
 * Registry-First schema system for package loading + domain lookup.
 */

// ----------------------------------------------------------------------
// 1. Registry Enumerations
// ----------------------------------------------------------------------

export const RegistryOwnerScopeSchema = z.enum(['core', 'default', 'user']);
export type RegistryOwnerScope = z.infer<typeof RegistryOwnerScopeSchema>;

export const RegistrySourceScopeSchema = z.enum(['core', 'local', 'config']);
export type RegistrySourceScope = z.infer<typeof RegistrySourceScopeSchema>;

export const RegistryDomainSchema = z.enum([
    'widget',
    'component',
    'feature',
    'parser',
    'tool',
    'process',
    'pipeline',
    'window',
    'registry',
]);
export type RegistryDomain = z.infer<typeof RegistryDomainSchema>;

// ----------------------------------------------------------------------
// 2. Registry Structures
// ----------------------------------------------------------------------

export const RegistryCodeLocatorSchema = z.object({
    bundle_file: z.string().optional(),
    export_name: z.string().optional(),
    module_path: z.string().optional(),
    handler_ref: z.string().optional(),
});
export type RegistryCodeLocator = z.infer<typeof RegistryCodeLocatorSchema>;

export const RuntimeSchemaKindSchema = z.enum(['json_schema', 'zod_like', 'custom']);
export type RuntimeSchemaKind = z.infer<typeof RuntimeSchemaKindSchema>;

export const RegistryRuntimeSchemaMetadataSchema = z.object({
    schema_ref: z.string().min(1),
    schema_version: z.string().min(1),
    schema_kind: RuntimeSchemaKindSchema.default('json_schema'),
    payload_schema: z.unknown().optional(),
    input_schema: z.unknown().optional(),
    output_schema: z.unknown().optional(),
});
export type RegistryRuntimeSchemaMetadata = z.infer<typeof RegistryRuntimeSchemaMetadataSchema>;

/**
 * Universal Domain Entry Schema
 * Represents any item in a package domain.
 * The specific shape is defined by AceRegistryType (registryTypes.ts) in the package itself.
 */
export const RegistryDomainEntrySchema = z.object({
    /** Code location strategy for the entry */
    locator: RegistryCodeLocatorSchema.optional(),
    /** Resolved implementation (class, function, object) */
    implementation: z.unknown().optional(),
}).catchall(z.unknown());
export type RegistryDomainEntry = z.infer<typeof RegistryDomainEntrySchema>;

// ----------------------------------------------------------------------
// 3. Registry Package + Registry Index
// ----------------------------------------------------------------------

export const RegistryPackageManifestSchema = z.object({
    namespace: z.string(),
    package_name: z.string(),
    version: z.string(),
    repository_path: z.string().optional(),
    file_location: z.string().optional(),
    entry_point: z.string().optional(),
    author: z.string().optional(),
    owner_scope: RegistryOwnerScopeSchema.default('user'),
    source_scope: RegistrySourceScopeSchema.default('local'),
    display_name: z.string().optional(),
    // Dependencies & Capabilities live here
    dependency_refs: z.array(z.any()).default([]),
    capability_requirements: z.array(z.any()).default([]),
    // Default locator for entire package
    locator: RegistryCodeLocatorSchema.optional(),
});
export type RegistryPackageManifest = z.infer<typeof RegistryPackageManifestSchema>;

export const RegistryPackageDomainsSchema = z.record(
    z.string(), 
    z.record(z.string(), RegistryDomainEntrySchema)
);
export type RegistryPackageDomains = z.infer<typeof RegistryPackageDomainsSchema>;

export const RegistryPackageSchema = z.object({
    manifest: RegistryPackageManifestSchema,
    domains: RegistryPackageDomainsSchema,
});
export type RegistryPackage = z.infer<typeof RegistryPackageSchema>;

export const RegistryPackageMetadataSchema = RegistryPackageManifestSchema;
export type RegistryPackageMetadata = z.infer<typeof RegistryPackageMetadataSchema>;

export const RegistryPackageIndexEntrySchema = z.object({
    metadata: RegistryPackageMetadataSchema,
    domains: RegistryPackageDomainsSchema,
});
export type RegistryPackageIndexEntry = z.infer<typeof RegistryPackageIndexEntrySchema>;

// Compatibility alias for still-migrating modules.
export type PackageManifest = {
    id: string;
    name: string;
    version: string;
    description?: string;
    domain: RegistryDomain;
    author?: string;
    status?: 'active' | 'inactive';
    releaseDate?: string;
    repositoryUrl?: string;
    permissions?: string[];
    dependencies?: Array<{ id: string; domain?: RegistryDomain; version?: string }>;
};
