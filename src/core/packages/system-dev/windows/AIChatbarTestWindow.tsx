import type { AceRegistryType } from '#/schemas/registryTypes';
import { AceWindow } from '#/components/layout/AceWindow';
import AIChatbarTest from '../components/AIChatbarTest';

export const registry: AceRegistryType.Window = {
    name: 'ai_chatbar_test_window',
    slug: 'ai-chatbar-test-window',
    react_behavior: 'window_shell',
    default_config: {
        x: 440,
        y: 120,
        width: 720,
        height: 540,
        title: 'AI Chatbar Test',
        chrome_style: 'standard',
        is_locked: false,
        always_on_top: false,
    },
};

export default function AIChatbarTestWindow({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid}>
            <AIChatbarTest />
        </AceWindow>
    );
}
