import type { WidgetRegistry } from '../../schemas/registry';

export const ExampleSystemMonitorRegistry: WidgetRegistry = {
    version: "1.0.0",
    repository_path: "github.com/example/system-monitor",
    file_location: "/home/user/.ace/plugins/system-monitor",
    author: "ExampleDeveloper",
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
    ]
};
