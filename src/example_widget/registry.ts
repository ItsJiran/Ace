import type { WidgetRegistry } from '../../schemas/registry';

export const ExampleSystemMonitorRegistry: WidgetRegistry = {
    package_name: "example_system_monitor",
    version: "1.0.0",
    repository_path: "github.com/example/system-monitor",
    file_location: "/home/user/.ace/plugins/system-monitor",
    author: "ExampleDeveloper",
    widgets: [
        {
            widget_name: "system_monitor_widget",
            component_name: "SystemMonitorComponent",
            window_name: "system_monitor_window",
            entry_file: "src/example_widget/components/SystemMonitor.tsx"
        }
    ],
    components: [
        {
            name: "SystemMonitorComponent",
            react_behavior: "headless_data_monitor",

            // This component reads these keys from the Global RAM Zustand store
            data_requirements: [
                "sys_cpu_load",
                "sys_memory_usage",
            ],

            // The component doesn't emit any UI clicks, but it could emit lookups
            emits_interactions: [
                "lookup_process_status"
            ],

            // 🎧 Note how it strictly listens for backend OS events
            listens_to: [
                {
                    listened_event: "os_metric_update",
                    reaction: {
                        // The Chef Process emitted this metric. The Engine catches it
                        // and instantly dumps it into Global RAM for the Waiter to read later!
                        reaction_type: "store_in_ram",
                        reaction_identifier: "sys_metric_buffer"
                    }
                },
                {
                    listened_event: "critical_system_alert",
                    reaction: {
                        // If the backend encounters a thermal throttle, bounce back
                        // an Interaction to explicitly OPEN a warning window in the UI layer
                        reaction_type: "emit_interaction",
                        reaction_identifier: "open_alert_window"
                    }
                }
            ]
        }
    ],
    windows: [
        {
            id: "window:example:system_monitor:v1",
            version: "1.0.0",
            registry_type: "window",
            display_name: "System Monitor Window",
            owner_scope: "user",
            source_scope: "local",
            is_enabled: true,
            dependency_refs: [],
            capability_requirements: [],
            tags: [],
            window_name: "system_monitor_window",
            component_name: "SystemMonitorComponent",
            default_window_preset: {
                component_name: "SystemMonitorComponent",
                width: 560,
                height: 360,
                title: "System Monitor"
            }
        }
    ],
    dependency_refs: [],
    capability_requirements: []
};
