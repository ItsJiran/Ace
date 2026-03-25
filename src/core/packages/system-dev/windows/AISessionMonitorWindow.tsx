import type { AceRegistryType } from '#/schemas/registryTypes';
import { AceWindow } from '#/components/layout/AceWindow';
import AISessionMonitor from '../components/AISessionMonitor';

export const registry: AceRegistryType.Window = {
    name: 'ai_session_monitor_window',
    slug: 'ai-session-monitor-window',
    react_behavior: 'window_shell',
    default_config: {
        x: 760,
        y: 120,
        width: 460,
        height: 540,
        title: 'AI Session Monitor',
        chrome_style: 'standard',
        is_locked: false,
        always_on_top: false,
    },
};

export default function AISessionMonitorWindow({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid}>
            <AISessionMonitor />
        </AceWindow>
    );
}
