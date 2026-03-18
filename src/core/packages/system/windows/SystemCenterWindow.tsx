import { SystemWidget } from '../components/SystemWidget';

export function SystemCenterWindow({ windowUid }: { windowUid: string }) {
    // Initialize window context and lifecycle
    window.ACE.hooks.useAceWindow(windowUid);

    return <SystemWidget />;
}
