const PACKAGE_NAME = 'itsjiran/ace-system';

let registered = false;

export function registerSystemPackageDomains() {
    if (registered) return;

    window.ACE.registry.add(PACKAGE_NAME, 'widgets', [
        {
            widget_name: 'system_widget',
            runtime_kind: 'ui_widget',
            component_name: 'system_widget',
            window_name: 'system_main_window',
            launch_profile: {
                surfaces: ['start_menu', 'command_palette'],
                launch_order: 10,
            },
            window_profile: {
                window_name: 'system_main_window',
                restoration_strategy: 'restore_state',
            },
        },
    ]);

    window.ACE.registry.add(PACKAGE_NAME, 'components', [
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
        {
            name: 'system_center_window',
            data_requirements: [],
            emits_interactions: [],
            listens_to: [],
            react_behavior: 'window_shell',
        },
        {
            name: 'system_console_window',
            data_requirements: [],
            emits_interactions: [],
            listens_to: [],
            react_behavior: 'window_shell',
        },
    ]);

    window.ACE.registry.add(PACKAGE_NAME, 'windows', [
        {
            registry_type: 'window',
            window_name: 'system_main_window',
            component_name: 'system_center_window',
        },
        {
            registry_type: 'window',
            window_name: 'system_console_window',
            component_name: 'system_console_window',
        },
    ]);

    window.ACE.registry.add(PACKAGE_NAME, 'tools', [
        {
            registry_type: 'tool',
            tool_name: 'install_widget_package',
        },
        {
            registry_type: 'tool',
            tool_name: 'install_tool_package',
        },
    ]);

    window.ACE.registry.add(PACKAGE_NAME, 'features', [
        {
            registry_type: 'feature',
            feature_name: 'system_center_dashboard',
        },
        {
            registry_type: 'feature',
            feature_name: 'package_install_queue',
        },
    ]);

    window.ACE.registry.add(PACKAGE_NAME, 'processes', [
        {
            registry_type: 'process',
            process_type: 'widget_install',
            observable: true,
            cancellable: true,
        },
        {
            registry_type: 'process',
            process_type: 'tool_install',
            observable: true,
            cancellable: true,
        },
    ]);

    window.ACE.registry.add(PACKAGE_NAME, 'pipelines', [
        {
            registry_type: 'pipeline',
            pipeline_name: 'install_widget_package',
            step_names: ['fetch_manifest', 'validate', 'install', 'register'],
            cancellable: true,
        },
        {
            registry_type: 'pipeline',
            pipeline_name: 'install_tool_package',
            step_names: ['fetch_manifest', 'validate', 'install', 'register'],
            cancellable: true,
        },
    ]);

    registered = true;
}
