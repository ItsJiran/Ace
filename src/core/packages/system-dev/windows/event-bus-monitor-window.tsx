import type { AceRegistryType } from '#/schemas/registry-types';
import { AceWindow } from '#/components/layout/ace-window';
import EventBusMonitor from '../components/event-bus-monitor';

export const registry: AceRegistryType.Window = {
    name: 'eventbus_monitor_window',
    slug: 'eventbus-monitor-window',
    react_behavior: 'window_shell',
    default_config: {
        x: 260,
        y: 120,
        width: 680,
        height: 500,
        title: 'EventBus Monitor',
        chrome_style: 'standard',
        is_locked: false,
        always_on_top: false,
    },
};

export default function EventBusMonitorWindow({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid}>
            <EventBusMonitor />
        </AceWindow>
    );
}
