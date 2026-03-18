import { SystemConsole } from '../components/SystemConsole';

export const registry = {
    components: [{
        name: 'system_console_window',
        data_requirements: [],
        emits_interactions: [],
        listens_to: [],
        react_behavior: 'window_shell',
    }],
    windows: [{
        registry_type: 'window',
        window_name: 'system_console_window',
        component_name: 'system_console_window',
    }],
};

export function SystemConsoleWindow({ windowUid }: { windowUid: string }) {
    // Initialize window context and lifecycle
    window.ACE.hooks.useAceWindow(windowUid);

    return <SystemConsole />;
}
