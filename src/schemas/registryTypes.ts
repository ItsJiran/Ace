/**
 * AceRegistryType — Simplified Declaration Types
 *
 * Used in package source files to type-check `export const registry`.
 * Runtime normalization (owner_scope, registry_type, generated IDs, etc.)
 * is handled by CorePackageLoader and RegistryEngine — you do NOT need to
 * specify those here.
 *
 * Future: This namespace is designed to be extractable as a standalone
 * `@ace/registry-types` npm package for user-submitted external packages.
 *
 * Usage:
 *   import type { AceRegistryType } from '#/schemas/registryTypes';
 *   export const registry: AceRegistryType.Widget = { widget_name: 'notepad' };
 */

export namespace AceRegistryType {
    // -----------------------------------------------------------------------
    // Widget — Entry point identity in the system (Start Menu, Command Palette)
    // Default export: React component (tile UI) or plain function (headless)
    // -----------------------------------------------------------------------
    export interface Widget {
        widget_name: string;
        entry_id?: string;
    }

    // -----------------------------------------------------------------------
    // Component — Pure React UI content rendered inside a window
    // Default export: React component function
    // -----------------------------------------------------------------------
    export interface Component {
        /** Unique component name used by ComponentRegistry to mount it */
        name: string;
        /** Semantic label for what this component renders/does */
        react_behavior: string;
        /** RAM keys this component reads (for documentation/tooling) */
        data_requirements?: string[];
    }

    // -----------------------------------------------------------------------
    // Window — Shell wrapper managing lifecycle via useAceWindow
    // Default export: React component that wraps a Component + calls useAceWindow
    // -----------------------------------------------------------------------
    export interface Window {
        /** Unique window name referenced by Widget's component_name */
        name: string;
        react_behavior: 'window_shell' | (string & {});
    }

    // -----------------------------------------------------------------------
    // Tool — Callable action invokable by AI gateway or EventEngine
    // Default export: async function implementing the tool logic
    // -----------------------------------------------------------------------
    export interface Tool {
        tool_name: string;
        display_name?: string;
        description?: string;
        parameters?: ToolParameters;
    }

    export interface ToolParameters {
        type: 'object';
        properties: Record<string, {
            type: string;
            description?: string;
            enum?: string[];
        }>;
        required?: string[];
    }

    // -----------------------------------------------------------------------
    // Feature — High-level capability declaration, triggered via events
    // Default export: function implementing the feature behavior
    // -----------------------------------------------------------------------
    export interface Feature {
        feature_name: string;
        display_name?: string;
        description?: string;
        /** EventEngine action keys that trigger this feature */
        trigger_actions?: string[];
    }

    // -----------------------------------------------------------------------
    // Process — Background task declaration, observable via ProcessEngine
    // Default export: async function that performs the background task
    // -----------------------------------------------------------------------
    export interface Process {
        process_type: string;
        display_name?: string;
        description?: string;
        /** Whether this process appears in the ProcessMonitor UI */
        observable?: boolean;
        /** Whether this process can be cancelled mid-execution */
        cancellable?: boolean;
    }

    // -----------------------------------------------------------------------
    // Pipeline — Multi-step sequential workflow
    // Default export: Pipeline class or factory function
    // -----------------------------------------------------------------------
    export interface Pipeline {
        pipeline_name: string;
        display_name?: string;
        description?: string;
        /** Ordered names of each step in the pipeline */
        step_names?: string[];
        cancellable?: boolean;
    }
}
