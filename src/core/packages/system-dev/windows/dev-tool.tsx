import type { AceRegistryType } from '#/schemas/registry-types';
import SystemDevConsole from '../components/dev-console';
import { useAceWindow } from '#/hooks/use-ace-window';

export const registry: AceRegistryType.Window = {
    name: 'system_dev_console_window',
    slug: 'system-dev-console-window',
    react_behavior: 'window_shell',
};

export const SystemDevConsoleWindow = ({ windowUid }: { windowUid: string }) => {
    useAceWindow(windowUid);

    return <SystemDevConsole />;
};
