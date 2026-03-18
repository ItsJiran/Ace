export const registry = {
    pipelines: [
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
    ]
};

/**
 * System package pipeline IDs placeholder.
 */
export const SystemPipelines = {
    install_widget_package: 'pipeline:itsjiran/ace-system:install_widget_package:v1',
    install_tool_package: 'pipeline:itsjiran/ace-system:install_tool_package:v1',
} as const;
