import type { AceRegistryType } from '#/schemas/registry-types';
import { AceWindow } from '#/components/layout/ace-window';
import AISessionInspector from '../components/ai-session-inspector';

export const registry: AceRegistryType.Window = {
    name: 'ai_session_inspector_window',
    slug: 'ai-session-inspector-window',
    react_behavior: 'window_shell',
    default_config: {
        x: 100,
        y: 60,
        width: 920,
        height: 700,
        title: 'AI Session Inspector',
        chrome_style: 'standard',
        is_locked: false,
        always_on_top: false,
    },
};

export default function AISessionInspectorWindow({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid}>
            <AISessionInspector />
        </AceWindow>
    );
}
