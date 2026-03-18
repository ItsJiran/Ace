import { z } from 'zod';
import { EventReactionSchema } from './events';
import { WindowConfigSchema } from './window';

/**
 * ============================================================================
 * ACE REGISTRY SCHEMA
 * Defines the contract for all installable packages, widgets, and capabilities.
 * ============================================================================
 */

// ----------------------------------------------------------------------
// 1. Core Enumerations & Scopes
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

// ----------------------------------------------------------------------
// 2. Dependency & Capability Models
// ----------------------------------------------------------------------

export const RegistryDependencyRefSchema = z.object({
    id: z.string(),
    domain: RegistryDomainSchema,
    version: z.string().optional(),
    optional: z.boolean().default(false),
});
export type RegistryDependencyRef = z.infer<typeof RegistryDependencyRefSchema>;

export const CapabilityRequirementSchema = z.object({
    capability: z.string(),
    required: z.boolean().default(true),
    description: z.string().optional(),
});
export type CapabilityRequirement = z.infer<typeof CapabilityRequirementSchema>;

// ----------------------------------------------------------------------
// 3. Base Registry Entry
// Shared properties for all non-widget domain entries (tools, windows, etc.)
// ----------------------------------------------------------------------

export const BaseRegistryEntrySchema = z.object({
    /** Optional unique ID (legacy/internal use) */
    id: z.string().optional(),
    /** Optional semantic version */
    version: z.string().optional(),
    /** The domain classification (tool, window, etc.) */
    registry_type: RegistryDomainSchema,
    
    /** Scope ownership (defaults to 'user') */
    owner_scope: RegistryOwnerScopeSchema.default('user'),
    /** Source location (defaults to 'local') */
    source_scope: FilesystemWidgetScopeSchema.default('local'),
    
    /** Human-readable name */
    display_name: z.string().optional(),
    description: z.string().optional(),
    source_path: z.string().optional(),
    
    is_enabled: z.boolean().default(true),
    dependency_refs: z.array(RegistryDependencyRefSchema).default([]),
    capability_requirements: z.array(CapabilityRequirementSchema).default([]),
    tags: z.array(z.string()).default([]),
});
export type BaseRegistryEntry = z.infer<typeof BaseRegistryEntrySchema>;

// ----------------------------------------------------------------------
// 4. Domain-Specific Schemas
// ----------------------------------------------------------------------

// --- Components (React/logic bindings) ---
export const WidgetComponentSchema = z.object({
    name: z.string(),
    data_requirements: z.array(z.string()),
    emits_interactions: z.array(z.string()),
    listens_to: z.array(z.object({
        listened_event: z.string(),
        reaction: EventReactionSchema,
    })),
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

// --- Tools (Executable functions) ---
export const ToolRegistryEntrySchema = BaseRegistryEntrySchema.extend({
    registry_type: z.literal('tool'),
    tool_name: z.string(),
    handler_ref: z.string().optional(),
    schema_ref: z.string().optional(),
    execution_engine: z.string().optional(),
});
export type ToolRegistryEntry = z.infer<typeof ToolRegistryEntrySchema>;

// --- Features (System capabilities) ---
export const FeatureRegistryEntrySchema = BaseRegistryEntrySchema.extend({
    registry_type: z.literal('feature'),
    feature_name: z.string(),
    handler_ref: z.string().optional(),
    trigger_actions: z.array(z.string()).default([]),
});
export type FeatureRegistryEntry = z.infer<typeof FeatureRegistryEntrySchema>;

// --- Processes (Background jobs) ---
export const ProcessRegistryEntrySchema = BaseRegistryEntrySchema.extend({
    registry_type: z.literal('process'),
    process_type: z.string(),
    handler_ref: z.string().optional(),
    observable: z.boolean().default(true),
    cancellable: z.boolean().default(false),
});
export type ProcessRegistryEntry = z.infer<typeof ProcessRegistryEntrySchema>;

// --- Pipelines (Orchestrated workflows) ---
export const PipelineRegistryEntrySchema = BaseRegistryEntrySchema.extend({
    registry_type: z.literal('pipeline'),
    pipeline_name: z.string(),
    step_names: z.array(z.string()).default([]),
    handler_ref: z.string().optional(),
    cancellable: z.boolean().default(false),
});
export type PipelineRegistryEntry = z.infer<typeof PipelineRegistryEntrySchema>;

// --- Windows (Shell containers) ---
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

// --- Recursive Registries (Meta) ---
export const RegistryRegistryEntrySchema = BaseRegistryEntrySchema.extend({
    registry_type: z.literal('registry'),
    registry_name: z.string(),
    supported_domains: z.array(RegistryDomainSchema).default([]),
    loader_ref: z.string().optional(),
});
export type RegistryRegistryEntry = z.infer<typeof RegistryRegistryEntrySchema>;

// ----------------------------------------------------------------------
// 5. Widget Binding Schema
// Defines the high-level application entry point.
// ----------------------------------------------------------------------

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

// ----------------------------------------------------------------------
// 6. Registry Package Schema (Root Container)
// The structure used when distributing or loading a full package.
// ----------------------------------------------------------------------

export const RegistryPackageSchema = z.object({
    /** Package namespace (e.g., 'acme') */
    namespace: z.string(),
    /** Package name (e.g., 'dashboard') */
    package_name: z.string(),
    /** Semantic version */
    version: z.string(),
    /** Repository/Source location hint */
    repository_path: z.string(),
    /** Physical file location hint */
    file_location: z.string(),
    /** Author name/email */
    author: z.string(),
    
    /** Default scope for contained items */
    owner_scope: RegistryOwnerScopeSchema.default('user'),
    source_scope: FilesystemWidgetScopeSchema.default('local'),
    
    display_name: z.string().optional(),
    
    // -- Domains --
    widgets: z.array(WidgetBindingSchema).default([]),
    components: z.array(ComponentRegistryEntrySchema).default([]),
    windows: z.array(WindowRegistryEntrySchema).default([]),
    tools: z.array(ToolRegistryEntrySchema).default([]),
    features: z.array(FeatureRegistryEntrySchema).default([]),
    processes: z.array(ProcessRegistryEntrySchema).default([]),
    pipelines: z.array(PipelineRegistryEntrySchema).default([]),
    registries: z.array(RegistryRegistryEntrySchema).default([]),
    
    // -- Metadata --
    dependency_refs: z.array(RegistryDependencyRefSchema).default([]),
    capability_requirements: z.array(CapabilityRequirementSchema).default([]),
});
export type RegistryPackage = z.infer<typeof RegistryPackageSchema>;
