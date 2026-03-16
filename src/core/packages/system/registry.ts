import type { WidgetRegistry } from '#/schemas/registry';

/**
 * System package registry bundle.
 * This mirrors the example_widget package style: one package identity
 * containing multiple registry domains.
 */
export const SystemPackageRegistry: WidgetRegistry = {
    package_name: 'system',
    version: '1.0.0',
    repository_path: 'core://system',
    file_location: 'src/core/packages/system',
    author: 'ACE Core',
    owner_scope: 'core',
    source_scope: 'core',
    display_name: 'System Package',
    widget_id: 'widget:ace:system:v1',
    widgets: [
        {
            widget_name: 'system_widget',
            component_name: 'system_widget',
            window_name: 'system_main_window',
            entry_file: 'src/core/packages/system/components/SystemWidget.tsx',
        },
    ],
    components: [
        {
            name: 'system_widget',
            data_requirements: ['system:config', 'system:keybinds', 'system:windows', 'system:install_requests'],
            emits_interactions: ['open_window', 'close_window', 'lookup', 'execute_tool'],
            listens_to: [],
            react_behavior: 'system_center',
        },
        {
            name: 'system_console',
            data_requirements: ['system:logs'],
            emits_interactions: [],
            listens_to: [],
            react_behavior: 'system_log_console',
        },
        {
            name: 'loading_widget',
            data_requirements: [],
            emits_interactions: [],
            listens_to: [],
            react_behavior: 'system_loading_state',
        },
    ],
    windows: [
        {
            id: 'window:ace:system_main:v1',
            version: '1.0.0',
            registry_type: 'window',
            display_name: 'System Main Window',
            owner_scope: 'core',
            source_scope: 'core',
            is_enabled: true,
            dependency_refs: [],
            capability_requirements: [],
            tags: [],
            window_name: 'system_main_window',
            component_name: 'system_widget',
            default_window_preset: {
                component_name: 'system_widget',
                width: 760,
                height: 520,
                title: 'System Center',
            },
        },
    ],
    dependency_refs: [],
    capability_requirements: [],
};
