import { SystemWidget } from '../components/SystemWidget';

export const registry = {
    components: [{
        name: 'system_center_window',
        data_requirements: [],
        emits_interactions: [],
        listens_to: [],
        react_behavior: 'window_shell',
    }],
    windows: [{
        registry_type: 'window',
        window_name: 'system_main_window',
        component_name: 'system_center_window',
    }],
};

export function SystemCenterWindow({ windowUid }: { windowUid: string }) {
    // Initialize window context and lifecycle
    window.ACE.hooks.useAceWindow(windowUid);

    return <SystemWidget />;
}
