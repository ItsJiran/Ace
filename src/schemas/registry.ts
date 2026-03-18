import { z } from 'zod';
import { EventReactionSchema } from './events';
import { WindowConfigSchema } from './window';



// ----------------------------------------------------------------------
// 3. Heartbeat & Connection Sync Schema
// ----------------------------------------------------------------------

export const GatewayHeartbeatSchema = z.object({
    status: z.enum(['alive', 'syncing', 'error']),
    latency_ms: z.number().optional(),
    active_version: z.string().optional(),
});

export type GatewayHeartbeat = z.infer<typeof GatewayHeartbeatSchema>;

// ----------------------------------------------------------------------
// 4. Multi-Registry Core Contracts
// ----------------------------------------------------------------------

export const RegistryOwnerScopeSchema = z.enum(['core', 'default', 'user']);
export type RegistryOwnerScope = z.infer<typeof RegistryOwnerScopeSchema>;

export const FilesystemWidgetScopeSchema = z.enum(['core', 'local', 'config']);
export type FilesystemWidgetScope = z.infer<typeof FilesystemWidgetScopeSchema>;

export const RegistryDomainSchema = z.enum([
    'widget',
    'component',
    'feature',
    'tool',
    'process',
    'pipeline',
    'window',
    'registry',
]);

export type RegistryDomain = z.infer<typeof RegistryDomainSchema>;

export const RegistryDependencyRefSchema = z.object({
    id: z.string(),
    domain: RegistryDomainSchema,
    version: z.string().optional(),
    optional: z.boolean().default(false),
});

export type RegistryDependencyRef = z.infer<typeof RegistryDependencyRefSchema>;

// ----------------------------------------------------------------------
// 5. Package Manifest Schema (Example for Package Registry)
// ----------------------------------------------------------------------

export const PackageManifestSchema = z.object({
    id: z.string(),
    name: z.string(),
    version: z.string(),
    description: z.string().optional(),
    author: z.string().optional(),
    domain: RegistryDomainSchema,
    dependencies: z.array(RegistryDependencyRefSchema).optional(),
    permissions: z.array(z.string()).optional(),
    status: z.enum(['active', 'inactive', 'error', 'installing']).default('active'),
    repositoryUrl: z.string().url().optional(),
    releaseDate: z.string().datetime().optional(),
});

export type PackageManifest = z.infer<typeof PackageManifestSchema>;

// Package-level registry contract used by RegistryEngine is defined below,
// after all domain entry schemas are declared.

export const CapabilityRequirementSchema = z.object({
    capability: z.string(),
    required: z.boolean().default(true),
    description: z.string().optional(),
});

export type CapabilityRequirement = z.infer<typeof CapabilityRequirementSchema>;

export const BaseRegistryEntrySchema = z.object({
    id: z.string(),
    version: z.string(),
    registry_type: RegistryDomainSchema,
    owner_scope: RegistryOwnerScopeSchema.default('user'),
    source_scope: FilesystemWidgetScopeSchema.default('local'),
    display_name: z.string(),
    description: z.string().optional(),
    source_path: z.string().optional(),
    is_enabled: z.boolean().default(true),
    dependency_refs: z.array(RegistryDependencyRefSchema).default([]),
    capability_requirements: z.array(CapabilityRequirementSchema).default([]),
    tags: z.array(z.string()).default([]),
});

export type BaseRegistryEntry = z.infer<typeof BaseRegistryEntrySchema>;

// ----------------------------------------------------------------------
// 5. Domain-Specific Registry Entries
// ----------------------------------------------------------------------

export const WidgetComponentSchema = z.object({
    /** The programmatic name of the UI component */
    name: z.string(),
    /** Array of state keys this component extracts from Global Storage */
    data_requirements: z.array(z.string()),

    /** 
     * Explicit list of Interaction Sub-Actions this widget is capable of emitting.
     * Enables the Gateway to know what actions to expect (e.g., ["send_gateway", "custom_open_modal"]).
     */
    emits_interactions: z.array(z.string()),

    /** 
     * Explicit list of external Listener events this component reacts to, 
     * and exactly what reaction the Engine should trigger when they occur.
     */
    listens_to: z.array(z.object({
        listened_event: z.string(),
        reaction: EventReactionSchema,
    })),

    /** String identifying its behavior mapping (e.g., "chat_bubble", "data_table") */
    react_behavior: z.string(),
});

export type WidgetComponent = z.infer<typeof WidgetComponentSchema>;

export const ComponentRegistryEntrySchema = BaseRegistryEntrySchema.extend({
    registry_type: z.literal('component'),
    component_name: z.string(),
    entry_component: z.string().optional(),
    component: WidgetComponentSchema,
});

export type ComponentRegistryEntry = z.infer<typeof ComponentRegistryEntrySchema>;

export const ToolRegistryEntrySchema = BaseRegistryEntrySchema.extend({
    registry_type: z.literal('tool'),
    tool_name: z.string(),
    handler_ref: z.string().optional(),
    schema_ref: z.string().optional(),
    execution_engine: z.string().optional(),
});

export type ToolRegistryEntry = z.infer<typeof ToolRegistryEntrySchema>;

export const FeatureRegistryEntrySchema = BaseRegistryEntrySchema.extend({
    registry_type: z.literal('feature'),
    feature_name: z.string(),
    handler_ref: z.string().optional(),
    trigger_actions: z.array(z.string()).default([]),
});

export type FeatureRegistryEntry = z.infer<typeof FeatureRegistryEntrySchema>;

export const ProcessRegistryEntrySchema = BaseRegistryEntrySchema.extend({
    registry_type: z.literal('process'),
    process_type: z.string(),
    handler_ref: z.string().optional(),
    observable: z.boolean().default(true),
    cancellable: z.boolean().default(false),
});

export type ProcessRegistryEntry = z.infer<typeof ProcessRegistryEntrySchema>;

export const PipelineRegistryEntrySchema = BaseRegistryEntrySchema.extend({
    registry_type: z.literal('pipeline'),
    pipeline_name: z.string(),
    step_names: z.array(z.string()).default([]),
    handler_ref: z.string().optional(),
    cancellable: z.boolean().default(false),
});

export type PipelineRegistryEntry = z.infer<typeof PipelineRegistryEntrySchema>;

export const WindowPresetSchema = WindowConfigSchema.pick({
    component_name: true,
    x: true,
    y: true,
    width: true,
    height: true,
    opacity: true,
    is_locked: true,
    always_on_top: true,
    chrome_style: true,
    drag_surface: true,
    hide_ring: true,
    title: true,
}).partial({
    x: true,
    y: true,
    width: true,
    height: true,
    opacity: true,
    is_locked: true,
    always_on_top: true,
    chrome_style: true,
    drag_surface: true,
    hide_ring: true,
    title: true,
});

export const WindowRegistryEntrySchema = BaseRegistryEntrySchema.extend({
    registry_type: z.literal('window'),
    window_name: z.string(),
    component_name: z.string(),
    default_window_preset: WindowPresetSchema.optional(),
});

export type WindowRegistryEntry = z.infer<typeof WindowRegistryEntrySchema>;

export const RegistryRegistryEntrySchema = BaseRegistryEntrySchema.extend({
    registry_type: z.literal('registry'),
    registry_name: z.string(),
    supported_domains: z.array(RegistryDomainSchema).default([]),
    loader_ref: z.string().optional(),
});

export type RegistryRegistryEntry = z.infer<typeof RegistryRegistryEntrySchema>;

export const WidgetRegistryEntrySchema = BaseRegistryEntrySchema.extend({
    registry_type: z.literal('widget'),
    widget_name: z.string(),
    entry_component: z.string().optional(),
    default_window_preset: WindowPresetSchema.optional(),
    declared_domains: z.array(RegistryDomainSchema).default([]),
});

export type WidgetRegistryEntry = z.infer<typeof WidgetRegistryEntrySchema>;

export const WidgetRuntimeKindSchema = z.enum(['ui_widget', 'headless_widget', 'hybrid_widget']);
export type WidgetRuntimeKind = z.infer<typeof WidgetRuntimeKindSchema>;

export const WidgetLaunchSurfaceSchema = z.enum(['start_menu', 'command_palette', 'auto_start', 'hidden']);
export type WidgetLaunchSurface = z.infer<typeof WidgetLaunchSurfaceSchema>;

export const WidgetLaunchProfileSchema = z.object({
    surfaces: z.array(WidgetLaunchSurfaceSchema).default(['start_menu']),
    default_visibility: z.enum(['visible', 'hidden']).default('visible'),
    startup_policy: z.enum(['never', 'opt_in', 'always']).default('never'),
    requires_user_pin: z.boolean().default(false),
    launch_order: z.number().int().default(100),
});

export type WidgetLaunchProfile = z.infer<typeof WidgetLaunchProfileSchema>;

export const WidgetWindowProfileSchema = z.object({
    profile_name: z.string().optional(),
    window_name: z.string().optional(),
    default_window_preset: WindowPresetSchema.optional(),
    restoration_strategy: z.enum(['fresh', 'restore_state', 'clone']).optional(),
    animation_profile_ref: z.string().optional(),
});

export type WidgetWindowProfile = z.infer<typeof WidgetWindowProfileSchema>;

export const WidgetActionBindingSchema = z.object({
    binding_type: z.enum(['tool', 'process', 'pipeline', 'feature', 'event']),
    binding_name: z.string(),
    payload_template: z.record(z.string(), z.unknown()).optional(),
});

export type WidgetActionBinding = z.infer<typeof WidgetActionBindingSchema>;

/**
 * Widget is the app-entry runtime unit.
 * It can be visual (`ui_widget`), non-visual (`headless_widget`), or mixed (`hybrid_widget`).
 */
export const WidgetBindingSchema = z.object({
    widget_name: z.string(),
    entry_id: z.string().optional(),
    runtime_kind: WidgetRuntimeKindSchema.default('ui_widget'),
    component_name: z.string().optional(),
    window_name: z.string().optional(),
    entry_file: z.string().optional(),
    launch_profile: WidgetLaunchProfileSchema.optional(),
    window_profile: WidgetWindowProfileSchema.optional(),
    settings_schema_ref: z.string().optional(),
    action_binding: WidgetActionBindingSchema.optional(),
}).superRefine((value, ctx) => {
    if (value.runtime_kind === 'ui_widget' && !value.component_name) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'ui_widget requires component_name',
            path: ['component_name'],
        });
    }

    if (value.runtime_kind === 'headless_widget' && !value.action_binding) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'headless_widget requires action_binding',
            path: ['action_binding'],
        });
    }

    if (value.runtime_kind === 'hybrid_widget' && !value.component_name && !value.action_binding) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'hybrid_widget requires component_name or action_binding',
            path: ['runtime_kind'],
        });
    }
});

export type WidgetBinding = z.infer<typeof WidgetBindingSchema>;

// Package-level registry contract used by RegistryEngine.
// A package is the submission unit, while domains are optional inside it.
export const RegistryPackageSchema = z.object({
    namespace: z.string(),
    package_name: z.string(),
    version: z.string(),
    repository_path: z.string(),
    file_location: z.string(),
    author: z.string(),
    owner_scope: RegistryOwnerScopeSchema.default('user'),
    source_scope: FilesystemWidgetScopeSchema.default('local'),
    display_name: z.string().optional(),
    widgets: z.array(WidgetBindingSchema).default([]),
    components: z.array(WidgetComponentSchema).default([]),
    windows: z.array(WindowRegistryEntrySchema).default([]),
    tools: z.array(ToolRegistryEntrySchema).default([]),
    features: z.array(FeatureRegistryEntrySchema).default([]),
    processes: z.array(ProcessRegistryEntrySchema).default([]),
    pipelines: z.array(PipelineRegistryEntrySchema).default([]),
    registries: z.array(RegistryRegistryEntrySchema).default([]),
    dependency_refs: z.array(RegistryDependencyRefSchema).default([]),
    capability_requirements: z.array(CapabilityRequirementSchema).default([]),
});

export type RegistryPackage = z.infer<typeof RegistryPackageSchema>;

export const AnyRegistryEntrySchema = z.discriminatedUnion('registry_type', [
    WidgetRegistryEntrySchema,
    ComponentRegistryEntrySchema,
    FeatureRegistryEntrySchema,
    ToolRegistryEntrySchema,
    ProcessRegistryEntrySchema,
    PipelineRegistryEntrySchema,
    WindowRegistryEntrySchema,
    RegistryRegistryEntrySchema,
]);

export type AnyRegistryEntry = z.infer<typeof AnyRegistryEntrySchema>;

// ----------------------------------------------------------------------
// 6. Backward Compatibility Alias
// ----------------------------------------------------------------------

// Keep this alias to avoid breaking old imports while runtime contract is package-centric.
export const WidgetRegistrySchema = RegistryPackageSchema;
export type WidgetRegistry = RegistryPackage;

// ----------------------------------------------------------------------
// 7. Filesystem Scope Registry Schemas
// ----------------------------------------------------------------------

export const RegistryDomainCollectionSchema = z.object({
    widgets: z.array(WidgetBindingSchema).default([]),
    components: z.array(ComponentRegistryEntrySchema).default([]),
    features: z.array(FeatureRegistryEntrySchema).default([]),
    tools: z.array(ToolRegistryEntrySchema).default([]),
    processes: z.array(ProcessRegistryEntrySchema).default([]),
    pipelines: z.array(PipelineRegistryEntrySchema).default([]),
    windows: z.array(WindowRegistryEntrySchema).default([]),
    registries: z.array(RegistryRegistryEntrySchema).default([]),
});

export type RegistryDomainCollection = z.infer<typeof RegistryDomainCollectionSchema>;

export const FilesystemRegistryScopeSchema = z.object({
    scope: FilesystemWidgetScopeSchema,
    root_path: z.string(),
    domains: RegistryDomainCollectionSchema,
});

export type FilesystemRegistryScope = z.infer<typeof FilesystemRegistryScopeSchema>;

export const MultiRegistryManifestSchema = z.object({
    core: FilesystemRegistryScopeSchema.optional(),
    local: FilesystemRegistryScopeSchema.optional(),
    config: FilesystemRegistryScopeSchema.optional(),
});

export type MultiRegistryManifest = z.infer<typeof MultiRegistryManifestSchema>;

// ----------------------------------------------------------------------
// 8. Package Ecosystem Wrapper
// ----------------------------------------------------------------------

/**
 * Package Ecosystem is the full wrapper contract for all registry domains.
 * Unlike WidgetRegistrySchema (focused on widget UI bundles), this schema can
 * include tools/components/windows/pipelines/features/processes/registries.
 */
export const PackageEcosystemSchema = z.object({
    package_name: z.string(),
    version: z.string(),
    owner_scope: RegistryOwnerScopeSchema.default('user'),
    source_scope: FilesystemWidgetScopeSchema.default('local'),
    widgets: z.array(WidgetBindingSchema).default([]),
    tools: z.array(ToolRegistryEntrySchema).default([]),
    components: z.array(ComponentRegistryEntrySchema).default([]),
    windows: z.array(WindowRegistryEntrySchema).default([]),
    pipelines: z.array(PipelineRegistryEntrySchema).default([]),
    features: z.array(FeatureRegistryEntrySchema).default([]),
    processes: z.array(ProcessRegistryEntrySchema).default([]),
    registries: z.array(RegistryRegistryEntrySchema).default([]),
    dependency_refs: z.array(RegistryDependencyRefSchema).default([]),
    capability_requirements: z.array(CapabilityRequirementSchema).default([]),
});

export type PackageEcosystem = z.infer<typeof PackageEcosystemSchema>;
