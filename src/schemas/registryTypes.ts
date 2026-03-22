import type { WindowConfig } from './window';

/**
 * AceRegistryType — Simplified Declaration Types
 *
 * Used in package source files to type-check `export const registry`.
 * Runtime normalization (owner_scope, registry_type, generated IDs, etc.)
 * is handled by RegistryEngine auto-discovery — you do NOT need to
 * specify those here.
 *
 * Future: This namespace is designed to be extractable as a standalone
 * `@ace/registry-types` npm package for user-submitted external packages.
 *
 * Usage:
 *   import type { AceRegistryType } from '#/schemas/registryTypes';
 *   export const registry: AceRegistryType.Widget = { name: 'notepad', slug: 'notepad' };
 */

export namespace AceRegistryType {
    export interface BaseIdentity {
        name: string;
        slug: string;
        description?: string;
    }

    export interface ToolParameters {
        type: 'object';
        properties: Record<string, {
            type: 'string' | 'number' | 'boolean' | 'object' | 'array';
            description?: string;
            enum?: string[];
        }>;
        required?: string[];
    }

    // -----------------------------------------------------------------------
    // Widget — Entry point identity in the system (Start Menu, Command Palette)
    // Default export: React component (tile UI) or plain function (headless)
    // -----------------------------------------------------------------------
    export interface Widget extends BaseIdentity {
        entry_id?: string;
        /** Should this widget launch automatically on system start? */
        autostart?: boolean;
        /** Which environments this widget is allowed to run in */
        environment?: ('dev' | 'prod')[];
    }

    // -----------------------------------------------------------------------
    // Component — Pure React UI content rendered inside a window
    // Default export: React component function
    // -----------------------------------------------------------------------
    export interface Component extends BaseIdentity {
        /** Unique component name used by ComponentRegistry to mount it */
        /** Semantic label for what this component renders/does */
        react_behavior: string;
        /** RAM keys this component reads (for documentation/tooling) */
        data_requirements?: string[];
    }

    // -----------------------------------------------------------------------
    // Window — Shell wrapper managing lifecycle via useAceWindow
    // Default export: React component that wraps a Component + calls useAceWindow
    // -----------------------------------------------------------------------
    export interface Window extends BaseIdentity {
        /** Used as initial state when WindowEngine.spawnWindow creates a window instance */
        default_config?: Partial<WindowConfig>;
        react_behavior: 'window_shell' | (string & {});
    }

    // -----------------------------------------------------------------------
    // Tool — Callable action invokable by AI gateway or EventEngine
    // Default export: async function implementing the tool logic
    // -----------------------------------------------------------------------
    export interface Tool extends BaseIdentity {
        parameters?: ToolParameters;
    }

    // -----------------------------------------------------------------------
    // Feature — High-level capability declaration, triggered via events
    // Default export: function implementing the feature behavior
    // -----------------------------------------------------------------------
    export interface Feature extends BaseIdentity {
        /** EventEngine action keys that trigger this feature */
        trigger_actions?: string[];
    }

    // -----------------------------------------------------------------------
    // Process — Background task declaration, observable via ProcessEngine
    // Default export: async function that performs the background task
    // -----------------------------------------------------------------------
    export interface Process extends BaseIdentity {
        /** Whether this process appears in the ProcessMonitor UI */
        observable?: boolean;
        /** Whether this process can be cancelled mid-execution */
        cancellable?: boolean;
    }

    // -----------------------------------------------------------------------
    // Pipeline — Multi-step sequential workflow
    // Default export: Pipeline class or factory function
    // -----------------------------------------------------------------------
    export interface Pipeline extends BaseIdentity {
        /** Ordered names of each step in the pipeline */
        step_names?: string[];
        cancellable?: boolean;
    }
}
