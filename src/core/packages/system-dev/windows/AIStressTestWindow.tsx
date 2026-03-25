import { useRef } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { useAceWindow } from '#/hooks/useAceWindow';
import { AceWindow } from '#/components/layout/AceWindow';
import AIStressTest from '../components/AIStressTest';

export const registry: AceRegistryType.Window = {
    name: 'AI Stress Test Window',
    slug: 'ai-stress-test-window',
    react_behavior: 'window_shell',
};

export default function AIStressTestWindow() {
    const windowRef = useRef<HTMLDivElement>(null);
    const { windowState, closeWindow, maximizeWindow, minimizeWindow, focusWindow } = useAceWindow();

    return (
        <AceWindow
            windowState={windowState}
            onClose={closeWindow}
            onMaximize={maximizeWindow}
            onMinimize={minimizeWindow}
            onFocus={focusWindow}
            title="AI Stress Test"
            defaultWidth={600}
            defaultHeight={500}
        >
            <div ref={windowRef} className="w-full h-full">
                <AIStressTest />
            </div>
        </AceWindow>
    );
}
