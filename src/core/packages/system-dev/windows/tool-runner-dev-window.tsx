import type { AceRegistryType } from '#/schemas/registry-types';
import { AceWindow } from '#/components/layout/ace-window';
import ToolRunnerDev from '../components/tool-runner-dev';

export const registry: AceRegistryType.Window = {
    name: 'tool_runner_dev_window',
    slug: 'tool-runner-dev-window',
    react_behavior: 'window_shell',
    default_config: {
        x: 360,
        y: 120,
        width: 620,
        height: 540,
        title: 'Tool Runner',
        chrome_style: 'standard',
        is_locked: false,
        always_on_top: false,
    },
};

export default function ToolRunnerDevWindow({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid}>
            <ToolRunnerDev />
        </AceWindow>
    );
}
