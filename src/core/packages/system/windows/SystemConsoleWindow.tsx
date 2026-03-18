import { SystemConsole } from '../components/SystemConsole';

export function SystemConsoleWindow({ windowUid }: { windowUid: string }) {
    // Initialize window context and lifecycle
    window.ACE.hooks.useAceWindow(windowUid);

    return <SystemConsole />;
}
