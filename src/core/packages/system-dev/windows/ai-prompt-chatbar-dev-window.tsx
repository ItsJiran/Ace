import type { AceRegistryType } from '#/schemas/registry-types';
import { AceWindow } from '#/components/layout/ace-window';
import AIPromptChatbarDev from '../components/ai-prompt-chatbar-dev';

export const registry: AceRegistryType.Window = {
    name: 'ai_prompt_chatbar_dev_window',
    slug: 'ai-prompt-chatbar-dev-window',
    react_behavior: 'window_shell',
    default_config: {
        x: 380,
        y: 120,
        width: 680,
        height: 520,
        title: 'Prompt Chatbar Dev',
        chrome_style: 'standard',
        is_locked: false,
        always_on_top: false,
    },
};

export default function AIPromptChatbarDevWindow({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid}>
            <AIPromptChatbarDev />
        </AceWindow>
    );
}
