import { DeferredWindowContent } from '#/app-desktop/components/layout/deferred-window-content';
import { SpatialVirtualizer } from '#/app-desktop/components/layout/spatial-virtualizer';
import { Share2, Power, MessageSquare, Settings2, TerminalSquare, Activity, GitBranch } from 'lucide-react';
import type { DesktopState } from '#/shared/schemas/state.ts';
import { useAceMemory } from '#/app-desktop/hooks/use-ace-memory';
import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';
import { RenderCounterBadge } from '#/app-desktop/components/dev/render-counter-badge';
import { defineComponent } from '#/lib/define-registry';
import { LoggerEngine } from '#/app-desktop/engines/logger-engine';

function DevMenu({ close }: { close: () => void }) {
    const overlayState = useAceMemory<DesktopState>('system:global_state:desktop');
    const { targets } = useAceTheme();
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

    const spawnSystemSettings = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system',
            window: 'system-settings-window',
            title: 'System Settings',
            width: 1024,
            height: 760,
            x: 360,
            y: 90,
        });
    };

    const spawnSystemRuntimeMonitor = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system',
            window: 'system-runtime-monitor-window',
            title: 'System Runtime Monitor',
            width: 1180,
            height: 760,
            x: 320,
            y: 80,
        });
    };

    const spawnSystemRAMMonitor = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system',
            window: 'system-ram-monitor-window',
            title: 'Kernel RAM Monitor',
            width: 1120,
            height: 740,
            x: 360,
            y: 100,
        });
    };

    const spawnSystemProcessMonitor = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system',
            window: 'system-process-monitor-window',
            title: 'Process Monitor',
            width: 1120,
            height: 740,
            x: 380,
            y: 110,
        });
    };

    const spawnSystemEventBusMonitor = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system',
            window: 'system-event-bus-monitor-window',
            title: 'Event Bus Monitor',
            width: 1120,
            height: 740,
            x: 400,
            y: 120,
        });
    };

    const spawnDevLogConsole = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system-dev',
            window: 'dev-log-console-window',
            title: 'Dev Logs',
            width: 940,
            height: 620,
            x: 440,
            y: 120,
            initial_memory_uids: [LoggerEngine.logsMemoryUid],
        });
    };

    const spawnAgentStreamDebug = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system-dev',
            window: 'agent-stream-debug-window',
            title: 'Agent Stream Debug',
            width: 520,
            height: 680,
            x: 500,
            y: 80,
        });
    };

    const spawnAgentGraphDebug = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system-dev',
            window: 'agent-graph-debug-window',
            title: 'Agent Graph Debug',
            width: 640,
            height: 720,
            x: 550,
            y: 80,
        });
    };

    const buttonClass = [
        targets.btn.first,
        'flex items-center justify-start gap-2 w-full px-3 py-2 mb-2 rounded-sm',
    ].join(' ');

    const menuItems = [
        {
            label: 'ACE Chat',
            icon: <MessageSquare size={14} className="text-sky-300" />,
            onClick: spawnSystemAIChat,
        },
        {
            label: 'System Settings',
            icon: <Settings2 size={14} className="text-amber-300" />,
            onClick: spawnSystemSettings,
        },
        {
            label: 'Runtime Monitor',
            icon: <Settings2 size={14} className="text-cyan-300" />,
            onClick: spawnSystemRuntimeMonitor,
        },
        {
            label: 'RAM Monitor',
            icon: <Settings2 size={14} className="text-blue-300" />,
            onClick: spawnSystemRAMMonitor,
        },
        {
            label: 'Process Monitor',
            icon: <Settings2 size={14} className="text-orange-300" />,
            onClick: spawnSystemProcessMonitor,
        },
        {
            label: 'Event Bus Monitor',
            icon: <Settings2 size={14} className="text-teal-300" />,
            onClick: spawnSystemEventBusMonitor,
        },
        {
            label: 'Dev Logs',
            icon: <TerminalSquare size={14} className="text-emerald-300" />,
            onClick: spawnDevLogConsole,
        },
        {
            label: 'Agent Stream Debug',
            icon: <Activity size={14} className="text-purple-300" />,
            onClick: spawnAgentStreamDebug,
        },
        {
            label: 'Agent Graph Debug',
            icon: <GitBranch size={14} className="text-cyan-300" />,
            onClick: spawnAgentGraphDebug,
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
                    className={[targets.btn.secondary, 'flex items-center py-3 gap-2'].join(' ')}
                >
                    <Power size={14} className="text-red-400" />
                    Quit Application
                </button>
            </div>
        </DeferredWindowContent>
    );
}

export default defineComponent(DevMenu, {
    name: 'dev_menu',
    slug: 'dev-menu',
    react_behavior: 'dev_menu',
});
