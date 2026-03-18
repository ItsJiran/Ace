import {
    useAceWidget,
    useAceComponent,
    useAceWindowRegistry,
    useAceTool,
    useAceFeature,
    useAceProcess,
    useAcePipeline,
} from '#/hooks/useAceRegistryDomain';

const PACKAGE_NAME = 'itsjiran/ace-system';

let registered = false;

export function registerSystemPackageDomains() {
    if (registered) return;

    useAceWidget.registry(PACKAGE_NAME, [
        {
            widget_name: 'system_widget',
            entry_id: 'widget:itsjiran/ace-system:system_widget:v1',
            runtime_kind: 'ui_widget',
            component_name: 'system_widget',
            window_name: 'system_main_window',
            launch_profile: {
                surfaces: ['start_menu', 'command_palette'],
                default_visibility: 'visible',
                startup_policy: 'never',
                requires_user_pin: false,
                launch_order: 10,
            },
            window_profile: {
                profile_name: 'system_main_default',
                window_name: 'system_main_window',
                restoration_strategy: 'restore_state',
            },
        },
    ]);

    useAceComponent.registry(PACKAGE_NAME, [
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
    ]);

    useAceWindowRegistry.registry(PACKAGE_NAME, [
        {
            id: 'window:itsjiran/ace-system:system_main:v1',
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
    ]);

    useAceTool.registry(PACKAGE_NAME, [
        {
            id: 'tool:itsjiran/ace-system:install_widget_package:v1',
            version: '1.0.0',
            registry_type: 'tool',
            display_name: 'Install Widget Package',
            owner_scope: 'core',
            source_scope: 'core',
            is_enabled: true,
            dependency_refs: [],
            capability_requirements: [],
            tags: ['installer', 'package'],
            tool_name: 'install_widget_package',
        },
        {
            id: 'tool:itsjiran/ace-system:install_tool_package:v1',
            version: '1.0.0',
            registry_type: 'tool',
            display_name: 'Install Tool Package',
            owner_scope: 'core',
            source_scope: 'core',
            is_enabled: true,
            dependency_refs: [],
            capability_requirements: [],
            tags: ['installer', 'package'],
            tool_name: 'install_tool_package',
        },
    ]);

    useAceFeature.registry(PACKAGE_NAME, [
        {
            id: 'feature:itsjiran/ace-system:center_dashboard:v1',
            version: '1.0.0',
            registry_type: 'feature',
            display_name: 'System Center Dashboard',
            owner_scope: 'core',
            source_scope: 'core',
            is_enabled: true,
            dependency_refs: [],
            capability_requirements: [],
            tags: ['system'],
            feature_name: 'system_center_dashboard',
            trigger_actions: [],
        },
        {
            id: 'feature:itsjiran/ace-system:package_install_queue:v1',
            version: '1.0.0',
            registry_type: 'feature',
            display_name: 'Package Install Queue',
            owner_scope: 'core',
            source_scope: 'core',
            is_enabled: true,
            dependency_refs: [],
            capability_requirements: [],
            tags: ['system', 'installer'],
            feature_name: 'package_install_queue',
            trigger_actions: [],
        },
    ]);

    useAceProcess.registry(PACKAGE_NAME, [
        {
            id: 'proc:itsjiran/ace-system:widget_install:v1',
            version: '1.0.0',
            registry_type: 'process',
            display_name: 'Widget Install Process',
            owner_scope: 'core',
            source_scope: 'core',
            is_enabled: true,
            dependency_refs: [],
            capability_requirements: [],
            tags: ['installer'],
            process_type: 'widget_install',
            observable: true,
            cancellable: true,
        },
        {
            id: 'proc:itsjiran/ace-system:tool_install:v1',
            version: '1.0.0',
            registry_type: 'process',
            display_name: 'Tool Install Process',
            owner_scope: 'core',
            source_scope: 'core',
            is_enabled: true,
            dependency_refs: [],
            capability_requirements: [],
            tags: ['installer'],
            process_type: 'tool_install',
            observable: true,
            cancellable: true,
        },
    ]);

    useAcePipeline.registry(PACKAGE_NAME, [
        {
            id: 'pipeline:itsjiran/ace-system:install_widget_package:v1',
            version: '1.0.0',
            registry_type: 'pipeline',
            display_name: 'Install Widget Package Pipeline',
            owner_scope: 'core',
            source_scope: 'core',
            is_enabled: true,
            dependency_refs: [],
            capability_requirements: [],
            tags: ['installer', 'package'],
            pipeline_name: 'install_widget_package',
            step_names: ['fetch_manifest', 'validate', 'install', 'register'],
            cancellable: true,
        },
        {
            id: 'pipeline:itsjiran/ace-system:install_tool_package:v1',
            version: '1.0.0',
            registry_type: 'pipeline',
            display_name: 'Install Tool Package Pipeline',
            owner_scope: 'core',
            source_scope: 'core',
            is_enabled: true,
            dependency_refs: [],
            capability_requirements: [],
            tags: ['installer', 'package'],
            pipeline_name: 'install_tool_package',
            step_names: ['fetch_manifest', 'validate', 'install', 'register'],
            cancellable: true,
        },
    ]);

    registered = true;
}
