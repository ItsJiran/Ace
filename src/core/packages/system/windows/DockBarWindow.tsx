import type { AceRegistryType } from '#/schemas/registryTypes';
import DockBar from '../components/DockBar';

export const registry: AceRegistryType.Window = {
    name: 'dock_bar_window',
    react_behavior: 'window_shell',
};

export const DockBarWindow = ({ windowUid }: { windowUid: string }) => {
    return <DockBar windowUid={windowUid} />;
};
