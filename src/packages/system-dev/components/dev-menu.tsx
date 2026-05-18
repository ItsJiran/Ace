import { DeferredWindowContent } from '#/components/layout/deferred-window-content';
import { SpatialVirtualizer } from '#/components/layout/spatial-virtualizer';
import { Share2, Power, MessageSquare } from 'lucide-react';
import type { DesktopState } from '#/schemas/state.ts';
import { useAceMemory } from '#/hooks/use-ace-memory';
import type { AceRegistryType } from '#/schemas/registry-types';
import { RenderCounterBadge } from '#/components/dev/render-counter-badge';

export const registry: AceRegistryType.Component = {
    name: 'dev_menu',
    slug: 'dev-menu',
    react_behavior: 'dev_menu',
};

export default function DevMenu({ close }: { close: () => void }) {
    const overlayState = useAceMemory<DesktopState>('system:global_state:desktop');
    const isAmbient = overlayState?.mode === 'ambient';

    const spawnSystemAIChat = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system',
            window: 'system-ai-chat-window',
            title: 'ACE Chat',
            width: 780,
            height: 660,
            x: 430,
            y: 100,
        });
    };

    const buttonClass =
        'flex items-center justify-start gap-2 system-btn-primary w-full px-3 py-2 mb-2 rounded-sm';

    const menuItems = [
        {
            label: 'ACE Chat',
            icon: <MessageSquare size={14} className="text-sky-300" />,
            onClick: spawnSystemAIChat,
        },
        {
            label: isAmbient ? 'Enter Interactive Mode' : 'Exit Interactive Mode',
            icon: <Share2 size={14} className={isAmbient ? 'text-blue-400' : 'text-red-300'} />,
            customClass: `flex items-center justify-start gap-2 px-3 py-2 rounded text-sm transition-colors border w-full mb-2 ${isAmbient ? 'bg-zinc-800/80 border-zinc-700/50 text-zinc-400' : 'bg-red-900/70 border-red-500 text-red-100 hover:bg-red-800'}`,
        },
    ];

    return (
        <DeferredWindowContent
            fallback={<div className="text-zinc-500 font-mono text-xs">Loading Dev Tools...</div>}
        >
            <div className="flex flex-col gap-2 w-full h-full p-2 relative">
                <RenderCounterBadge componentName="dev-menu" />

                <SpatialVirtualizer className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
                    {menuItems.map((item, idx) => (
                        <button
                            key={idx}
                            onClick={item.onClick}
                            className={item.customClass || buttonClass}
                        >
                            {item.icon}
                            {item.label}
                        </button>
                    ))}
                </SpatialVirtualizer>

                <div className="mt-auto h-px bg-zinc-800/50 my-2" />

                <button
                    onClick={() => void close()}
                    className="flex items-center system-btn-secondary py-3 gap-2"
                >
                    <Power size={14} className="text-red-400" />
                    Quit Application
                </button>
            </div>
        </DeferredWindowContent>
    );
}
