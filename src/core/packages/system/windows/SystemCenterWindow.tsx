import type { AceRegistryType } from '#/schemas/registryTypes';
import { SystemWidget } from '../components/SystemWidget';
import { useAceWindow } from '#/hooks/useAceWindow';

export const registry: AceRegistryType.Window = {
    name: 'system_center_window',
    react_behavior: 'window_shell',
};

export function SystemCenterWindow({ windowUid }: { windowUid: string }) {
    // Initialize window context and lifecycle
    useAceWindow(windowUid);

    return <SystemWidget />;
}
