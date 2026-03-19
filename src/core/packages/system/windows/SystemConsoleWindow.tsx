import type { AceRegistryType } from '#/schemas/registryTypes';
import SystemConsole from '../components/SystemConsole';
import { useAceWindow } from '#/hooks/useAceWindow';

export const registry: AceRegistryType.Window = {
    name: 'system_console_window',
    react_behavior: 'window_shell',
};

export function SystemConsoleWindow({ windowUid }: { windowUid: string }) {
    // Initialize window context and lifecycle
    useAceWindow(windowUid);

    return <SystemConsole />;
}
