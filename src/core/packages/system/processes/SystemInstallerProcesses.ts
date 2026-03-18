export const registry = {
    processes: [
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
    ]
};

/**
 * System installer process IDs placeholder.
 * Runtime handlers can be added when installer engine is implemented.
 */
export const SystemInstallerProcesses = {
    widget_install: 'proc:itsjiran/ace-system:widget_install',
    tool_install: 'proc:itsjiran/ace-system:tool_install',
} as const;
