import type { AceRegistryType } from '#/schemas/registry-types';
import { AceWindow } from '#/components/layout/ace-window';
import ProcessMonitorDev from '../components/process-monitor-dev';

export const registry: AceRegistryType.Window = {
    name: 'process_monitor_dev_window',
    slug: 'process-monitor-dev-window',
    react_behavior: 'window_shell',
    default_config: {
        x: 300,
        y: 140,
        width: 620,
        height: 500,
        title: 'Process Monitor',
        chrome_style: 'standard',
        is_locked: false,
        always_on_top: false,
    },
};

export default function ProcessMonitorDevWindow({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid}>
            <ProcessMonitorDev />
        </AceWindow>
    );
}
