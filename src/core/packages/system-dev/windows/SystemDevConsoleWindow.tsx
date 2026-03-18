import type { AceRegistryType } from '#/schemas/registryTypes';
import { SystemDevConsole } from '../components/SystemDevConsole';
import { useAceWindow } from '#/hooks/useAceWindow';

export const registry: AceRegistryType.Window = {
    name: 'system_dev_console_window',
    react_behavior: 'window_shell',
};

export const SystemDevConsoleWindow = ({ windowUid }: { windowUid: string }) => {
    useAceWindow(windowUid);

    return <SystemDevConsole />;
};
