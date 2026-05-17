import { DeferredWindowContent } from '#/components/layout/deferred-window-content';
import { SpatialVirtualizer } from '#/components/layout/spatial-virtualizer';
import { Share2, Power, Terminal, Bug, Settings, Gauge, Activity, MemoryStick, Wand2, BellRing, MessageSquare, Monitor, MessageCircle, Wrench, Workflow, ListTree } from 'lucide-react';
import type { DesktopState } from '#/schemas/global-state';
import { useAceMemory } from '#/hooks/use-ace-memory';
import { useAceEvent } from '#/hooks/use-ace-event';
import type { AceRegistryType } from '#/schemas/registry-types';
import { RenderCounterBadge } from '#/components/dev/render-counter-badge';
import { closeCurrentHostWindow, focusHostDevtools } from '#/services/runtime/desktop-host';

export const registry: AceRegistryType.Component = {
    name: 'dev_menu',
    slug: 'dev-menu',
    react_behavior: 'dev_menu'
};

export default function DevMenu() {
    const overlayState = useAceMemory<DesktopState>('system:global_state:desktop');
    const isAmbient = overlayState?.mode === 'ambient';

    const { emit: emitDebugAction } = useAceEvent('debug_action');

    const spawnSystemSettings = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system',
            window: 'system-settings-window',
            title: 'System Settings',
            width: 1000,
            height: 700
        });
    };

    const spawnMockSettings = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system',
            window: 'mock-settings-window',
            title: 'Mock Settings (Local State Test)',
            width: 1000,
            height: 700
        });
    };

    const spawnSystemConsole = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system',
            window: 'system-console-window',
            title: 'System Console',
            width: 620,
            height: 400,
            x: 360,
            y: 240
        });
    };

    const spawnPerformanceDebug = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system-dev',
            window: 'perf-debug-window',
            title: 'Performance Debug',
            width: 450,
            height: 500,
            x: 200,
            y: 100
        });
    };
    const spawnPerformanceWidget = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system-dev',
            window: 'perf-hud-window',
            title: 'Performance HUD',
            width: 220,
            height: 40,
            x: typeof window !== 'undefined' ? window.innerWidth - 240 : 100,
            y: 20,
            chrome_style: 'borderless',
            always_on_top: true,
            is_locked: false,
        });
    };

    const spawnAISessionInspector = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system-dev',
            window: 'ai-session-inspector-window',
            title: 'AI Session Inspector',
            always_on_top: true,
            is_locked: false,
            width: 620,
            height: 400,
        });
    };

    const spawnStressTest = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system-dev',
            window: 'stress-test-window',
            title: 'Stress Test Suite',
            width: 380,
            height: 480,
            x: 200,
            y: 100
        });
    };

    const spawnPromptMorphWindow = () => {
        const viewportWidth = window.innerWidth || 1920;
        const viewportHeight = window.innerHeight || 1080;

        const compactSize = 56;
        const expandedWidth = Math.min(680, Math.max(420, Math.floor(viewportWidth * 0.52)));
        const expandedHeight = 66;

        const compactX = Math.round((viewportWidth - compactSize) / 2);
        const compactY = Math.max(24, viewportHeight - 140);
        const expandedX = Math.round((viewportWidth - expandedWidth) / 2);
        const expandedY = Math.max(20, viewportHeight - 148);

        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system-dev',
            window: 'prompt-morph-window',
            title: 'Prompt Morph',
            width: compactSize,
            height: compactSize,
            x: compactX,
            y: compactY,
            chrome_style: 'borderless',
            drag_surface: 'full',
            hide_ring: true,
            always_on_top: true,
        });
    };

    const spawnRamMonitor = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system-dev',
            window: 'ram-monitor-window',
            title: 'RAM Monitor',
            width: 520,
            height: 580,
            x: 160,
            y: 120,
        });
    };

    const spawnAIChatbarTest = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system-dev',
            window: 'ai-chatbar-test-window',
            title: 'AI Chatbar Test',
            width: 720,
            height: 540,
            x: 440,
            y: 120,
        });
    };

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

    const spawnToolRunner = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system-dev',
            window: 'tool-runner-dev-window',
            title: 'Tool Runner',
            width: 620,
            height: 540,
            x: 360,
            y: 120,
        });
    };

    const spawnParserBlockRegistry = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system-dev',
            window: 'parser-block-registry-list-window',
            title: 'Parser Block Registry',
            width: 640,
            height: 460,
            x: 280,
            y: 120,
        });
    };

    const spawnParserBlockPlayground = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system-dev',
            window: 'parser-block-playground-window',
            title: 'Parser Block Playground',
            width: 860,
            height: 560,
            x: 320,
            y: 110,
        });
    };

    const spawnRendererRegistry = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system-dev',
            window: 'renderer-registry-list-window',
            title: 'Renderer Registry',
            width: 560,
            height: 460,
            x: 280,
            y: 120,
        });
    };

    const spawnEventBusMonitor = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system-dev',
            window: 'eventbus-monitor-window',
            title: 'EventBus Monitor',
            width: 720,
            height: 540,
            x: 380,
            y: 140,
        });
    };

    const spawnProcessMonitor = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system-dev',
            window: 'process-monitor-dev-window',
            title: 'Process Monitor',
            width: 640,
            height: 520,
            x: 400,
            y: 130,
        });
    };

    const spawnPromptChatbarDev = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system-dev',
            window: 'prompt-chatbar-dev-window',
            title: 'Prompt Chatbar Dev',
            width: 780,
            height: 580,
            x: 460,
            y: 140,
        });
    };

    const pushNotificationSample = () => {
        window.ACE.window.pushNotification({
            title: 'Test Notification',
            message: 'This is a test notification dispatched from DevMenu.',
            urgency: 'high',
            icon: 'bell',
            payload: {
                test: true,
                monitor_width: window.innerWidth,
                monitor_height: window.innerHeight,
            },
            source: {
                package: 'itsjiran/ace-system-dev',
                action: 'devmenu_push_notification',
            },
            ttl_ms: 8000,
        });
    };

    const toggleOverlayMode = () => {
        window.ACE.window.setOverlayMode(isAmbient ? 'interactive' : 'ambient');
    };

    const openDevTools = () => {
        void focusHostDevtools();
    };

    const toggleFPS = () => {
        window.ACE.window.spawnWindow({
            package: 'itsjiran/ace-system-dev',
            window: 'fps-overlay',
            title: 'FPS',
            width: 70,
            height: 26,
            x: 10,
            y: 10,
            opacity: 0.9,
            always_on_top: true,
            is_locked: false
        });
    };

    const buttonClass = 'flex items-center justify-start gap-2 system-btn-primary w-full px-3 py-2 mb-2 rounded-sm';

    const menuItems = [
        { label: 'System Settings', icon: <Settings size={14} className="text-blue-400" />, onClick: spawnSystemSettings },
        { label: 'Mock Settings (Pure Local)', icon: <Settings size={14} className="text-purple-400" />, onClick: spawnMockSettings },
        { label: 'FPS Counter', icon: <Gauge size={14} className="text-yellow-400" />, onClick: toggleFPS },
        { label: 'System Console', icon: <Terminal size={14} className="text-indigo-400" />, onClick: spawnSystemConsole },
        { label: 'Open DevTools', icon: <Bug size={14} className="text-emerald-400" />, onClick: openDevTools },
        { label: 'Performance Metrics (RAM/FPS)', icon: <Activity size={14} className="text-pink-400" />, onClick: spawnPerformanceDebug },
        { label: 'Performance Widget (HUD)', icon: <Activity size={14} className="text-amber-400" />, onClick: spawnPerformanceWidget },
        { label: 'Spawn Stress Test Widget', icon: <Activity size={14} className="text-rose-400" />, onClick: spawnStressTest },
        { label: 'Spawn Prompt Morph', icon: <Wand2 size={14} className="text-fuchsia-400" />, onClick: spawnPromptMorphWindow },
        { label: 'RAM Monitor', icon: <MemoryStick size={14} className="text-cyan-400" />, onClick: spawnRamMonitor },
        { label: 'ACE Chat', icon: <MessageSquare size={14} className="text-sky-300" />, onClick: spawnSystemAIChat },
        { label: 'AI Chatbar Test Window', icon: <MessageSquare size={14} className="text-emerald-300" />, onClick: spawnAIChatbarTest },
        { label: 'Prompt Chatbar Dev Window', icon: <MessageCircle size={14} className="text-sky-300" />, onClick: spawnPromptChatbarDev },
        { label: 'AI Session Inspector', icon: <Monitor size={14} className="text-lime-300" />, onClick: spawnAISessionInspector },
        { label: 'EventBus Monitor', icon: <Workflow size={14} className="text-cyan-300" />, onClick: spawnEventBusMonitor },
        { label: 'Process Monitor', icon: <Activity size={14} className="text-fuchsia-300" />, onClick: spawnProcessMonitor },
        { label: 'Tool Runner', icon: <Wrench size={14} className="text-amber-400" />, onClick: spawnToolRunner },
        { label: 'Parser Block Registry', icon: <ListTree size={14} className="text-violet-300" />, onClick: spawnParserBlockRegistry },
        { label: 'Parser Block Playground', icon: <ListTree size={14} className="text-cyan-300" />, onClick: spawnParserBlockPlayground },
        { label: 'Renderer Registry', icon: <ListTree size={14} className="text-emerald-400" />, onClick: spawnRendererRegistry },
        { label: 'Push Notification', icon: <BellRing size={14} className="text-orange-400" />, onClick: pushNotificationSample },
        {
            label: isAmbient ? 'Enter Interactive Mode' : 'Exit Interactive Mode',
            icon: <Share2 size={14} className={isAmbient ? "text-blue-400" : "text-red-300"} />,
            onClick: toggleOverlayMode,
            customClass: `flex items-center justify-start gap-2 px-3 py-2 rounded text-sm transition-colors border w-full mb-2 ${isAmbient ? 'bg-zinc-800/80 border-zinc-700/50 text-zinc-400' : 'bg-red-900/70 border-red-500 text-red-100 hover:bg-red-800'}`
        }
    ];

    return (
        <DeferredWindowContent fallback={<div className="text-zinc-500 font-mono text-xs">Loading Dev Tools...</div>}>
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
                    onClick={() => void closeCurrentHostWindow()}
                    className="flex items-center system-btn-secondary py-3 gap-2"
                >
                    <Power size={14} className="text-red-400" />
                    Quit Application
                </button>
            </div>
        </DeferredWindowContent>
    );
}
