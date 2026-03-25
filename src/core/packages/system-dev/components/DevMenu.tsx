import { Share2, Power, Terminal, Bug, Settings, Gauge, Activity, MemoryStick, Wand2, BellRing, MessageSquare } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useState } from 'react';
import type { GlobalOverlayState } from '#/schemas/window';
import { useAceMemory } from '#/hooks/useAceMemory';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { RenderCounterBadge } from '#/components/dev/RenderCounterBadge';

export const registry: AceRegistryType.Component = {
    name: 'dev_menu',
    slug: 'dev-menu',
    react_behavior: 'dev_menu'
};

export default function DevMenu() {
    const overlayState = useAceMemory<GlobalOverlayState>('system:overlay_state');
    const [parserPrompt, setParserPrompt] = useState('');
    const [parserMemoryUid, setParserMemoryUid] = useState('system:dev:ai_parser:last');
    const [parserSessionId, setParserSessionId] = useState<string | null>(null);
    const parserMemory = useAceMemory<any>(parserMemoryUid);
    
    const isAmbient = overlayState?.mode === 'ambient';

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

        // Keep it visible across different monitor sizes
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
            animation_sequence: {
                pattern_id: 'anim:prompt_bar:devmenu_morph:stateful_fixed:v1',
                positioning_mode: 'stateful_fixed',
                interrupt_policy: 'retarget',
                loop: false,
                on_complete: 'idle',
                segments: [
                    {
                        phase_label: 'expand',
                        duration_ms: 520,
                        from: 'current',
                        to: { x: expandedX, y: expandedY, width: expandedWidth, height: 64 },
                        easing: 'spring_back',
                        hold_ms: 120,
                    },
                    {
                        phase_label: 'settle',
                        duration_ms: 360,
                        from: 'current',
                        to: { x: expandedX, y: expandedY, width: expandedWidth, height: expandedHeight },
                        easing: 'ease_out',
                        hold_ms: 0,
                    },
                ],
            },
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

    const pushNotificationSample = () => {
        const notifier = window.ACE.notification;
        if (!notifier) {
            console.warn('[DevMenu] Notification API not ready yet.');
            return;
        }

        notifier.push({
            title: 'DevMenu Trigger',
            message: 'Sample notification pushed from Dev Menu.',
            level: 'info',
            target: { type: 'global' },
            payload: {
                source: 'dev-menu',
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
        // Use direct WindowEngine call for synchronicity
        window.ACE.window.setOverlayMode(isAmbient ? 'interactive' : 'ambient');
    };

    const openDevTools = () => {
        window.ACE.event.emit({
            event_type: 'interaction',
            action: 'debug_action',
            payload: { action: 'open_devtools' }
        } as any);
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

    const buttonClass = 'flex items-center gap-2 bg-zinc-800/80 hover:bg-zinc-700 active:bg-zinc-600 px-3 py-2 rounded text-sm border border-zinc-700/50 text-zinc-300';

    const submitParserPrompt = async () => {
        const prompt = parserPrompt.trim();
        if (!prompt) return;

        const sdk = window.ACE.ai_gateway.getActiveSDK() || 'openai';
        const model = window.ACE.ai_gateway.getActiveModel() || 'gpt-4o-mini';

        let sessionId = parserSessionId;
        if (!sessionId) {
            sessionId = await window.ACE.ai_gateway.createSession(sdk, model);
            setParserSessionId(sessionId);
        }

        window.ACE.event.emit({
            event_type: 'interaction',
            action: 'send_gateway',
            payload: {
                prompt,
            },
            preallocated_memory: {
                reply_to_ram_key: parserMemoryUid,
                session_id: sessionId,
                sdk,
                model,
            },
        } as any);

        setParserPrompt('');
    };

    return (
        <div className="flex flex-col gap-2 w-full h-full p-2 relative">
            <RenderCounterBadge componentName="DevMenu" />
            <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 px-1">
                Development Kit
            </div>

            <div className="rounded border border-zinc-700/50 bg-zinc-900/50 p-2 flex flex-col gap-2">
                <div className="text-[11px] font-semibold text-cyan-300 uppercase tracking-wide">
                    AI Parser EventBus Test
                </div>

                <input
                    value={parserMemoryUid}
                    onChange={(e) => setParserMemoryUid(e.target.value)}
                    className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300"
                    placeholder="target memory uid"
                />

                <textarea
                    value={parserPrompt}
                    onChange={(e) => setParserPrompt(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            void submitParserPrompt();
                        }
                    }}
                    className="w-full rounded bg-zinc-950 border border-zinc-700 px-2 py-1 text-[12px] text-zinc-200 min-h-[62px]"
                    placeholder="Type prompt then press Enter to emit send_gateway with targeted memory"
                />

                <div className="flex items-center justify-between gap-2">
                    <button onClick={() => void submitParserPrompt()} className="px-2 py-1 rounded text-xs bg-cyan-700/70 hover:bg-cyan-600 text-cyan-50 border border-cyan-500/40">
                        Send Prompt
                    </button>
                    <div className="text-[10px] text-zinc-400 truncate max-w-[170px]" title={parserSessionId || ''}>
                        session: {parserSessionId || '-'}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-400">
                    <div>status: <span className="text-zinc-200">{parserMemory?.status || '-'}</span></div>
                    <div>batches: <span className="text-zinc-200">{parserMemory?.parser_batch_count ?? 0}</span></div>
                    <div>events: <span className="text-zinc-200">{parserMemory?.events_total ?? 0}</span></div>
                    <div>raw chars: <span className="text-zinc-200">{parserMemory?.raw_response?.length ?? 0}</span></div>
                </div>

                <details className="rounded border border-zinc-800 bg-zinc-950/50 p-2">
                    <summary className="cursor-pointer text-[11px] text-zinc-300">Raw Response</summary>
                    <pre className="mt-2 text-[10px] leading-4 text-zinc-400 whitespace-pre-wrap break-words max-h-32 overflow-auto">
                        {parserMemory?.raw_response || ''}
                    </pre>
                </details>

                <details className="rounded border border-zinc-800 bg-zinc-950/50 p-2" open>
                    <summary className="cursor-pointer text-[11px] text-zinc-300">Parser Batches (JSON Array)</summary>
                    <pre className="mt-2 text-[10px] leading-4 text-zinc-400 whitespace-pre-wrap break-words max-h-44 overflow-auto">
                        {JSON.stringify(parserMemory?.parser_batches || [], null, 2)}
                    </pre>
                </details>
            </div>

            <button onClick={spawnSystemSettings} className={buttonClass}>
                <Settings size={14} className="text-blue-400" />
                System Settings
            </button>

            <button onClick={spawnMockSettings} className={buttonClass}>
                <Settings size={14} className="text-purple-400" />
                Mock Settings (Pure Local)
            </button>

            <button onClick={toggleFPS} className={buttonClass}>
                <Gauge size={14} className="text-yellow-400" />
                FPS Counter
            </button>

            <button onClick={spawnSystemConsole} className={buttonClass}>
                <Terminal size={14} className="text-indigo-400" />
                System Console
            </button>

            <button onClick={openDevTools} className={buttonClass}>
                <Bug size={14} className="text-emerald-400" />
                Open DevTools
            </button>

            <button onClick={spawnStressTest} className={buttonClass}>
                <Activity size={14} className="text-rose-400" />
                Spawn Stress Test Widget
            </button>

            <button onClick={spawnPromptMorphWindow} className={buttonClass}>
                <Wand2 size={14} className="text-fuchsia-400" />
                Spawn Prompt Morph
            </button>

            <button onClick={spawnRamMonitor} className={buttonClass}>
                <MemoryStick size={14} className="text-cyan-400" />
                RAM Monitor
            </button>

            <button onClick={spawnAIChatbarTest} className={buttonClass}>
                <MessageSquare size={14} className="text-emerald-300" />
                AI Chatbar Test Window
            </button>

            <button onClick={pushNotificationSample} className={buttonClass}>
                <BellRing size={14} className="text-orange-400" />
                Push Notification
            </button>

            <button
                onClick={toggleOverlayMode}
                className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors border ${isAmbient ? 'bg-zinc-800/80 border-zinc-700/50 text-zinc-400' : 'bg-red-900/40 border-red-500/50 text-red-100 hover:bg-red-800/50'}`}
            >
                <Share2 size={14} className={isAmbient ? "text-blue-400" : "text-red-300"} />
                {isAmbient ? 'Enter Interactive Mode' : 'Exit Interactive Mode'}
            </button>

            <div className="mt-auto h-px bg-zinc-800/50 my-2" />

            <button
                onClick={() => getCurrentWindow().close()}
                className="flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors border bg-red-950/60 border-red-800/50 text-red-300 hover:bg-red-900/80 hover:text-red-100"
            >
                <Power size={14} className="text-red-400" />
                Quit Application
            </button>
        </div>
    );
}
