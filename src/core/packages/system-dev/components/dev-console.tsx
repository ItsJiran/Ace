import type { AceRegistryType } from '#/schemas/registry-types';
import { Layers, HardDrive, Share2, PaintBucket, Power, Activity, ListTree, Workflow, Wrench, PanelTop, Gauge, Flame } from 'lucide-react';
import type { DesktopState } from '#/schemas/global-state';
import { useAceMemory } from '#/hooks/use-ace-memory';
import { useAceEvent } from '#/hooks/use-ace-event';
import { closeCurrentHostWindow } from '#/services/runtime/desktop-host';

interface RuntimeRegistryDomains {
    windows?: Array<{
        id?: string;
        package_name?: string;
        owner_scope?: 'core' | 'default' | 'user';
        source_scope?: 'core' | 'local' | 'config';
        is_enabled?: boolean;
        display_name?: string;
        window_name?: string;
        component_name?: string;
        name?: string;
        slug?: string;
        default_window_preset?: {
            x?: number;
            y?: number;
            width?: number;
            height?: number;
            title?: string;
        };
    }>;
}

export const registry: AceRegistryType.Component = {
    name: 'system_dev_console_ui',    slug: 'system-dev-console-ui',    react_behavior: 'dev_console',
};

export default function SystemDevConsole() {
    const overlayState = useAceMemory<DesktopState>('system:global_state:desktop');
    const registryDomains = useAceMemory<RuntimeRegistryDomains>('system:registry_domains');

    // Fallbacks just in case the engine isn't ready
    const isAmbient = overlayState?.mode === 'ambient';
    const isDebugBg = overlayState?.debug_bg ?? false;

    const { emit: emitOpenWindow } = useAceEvent('open_window');
    const { emit: emitOverlayMode } = useAceEvent('set_overlay_mode');
    const { emit: emitDebugAction } = useAceEvent('debug_action');

    const openDevWindow = (component_name: string, title: string, x: number, y: number, width: number, height: number) => {
        emitOpenWindow({ component_name, title, x, y, width, height });
    };

    const toggleOverlayMode = () => {
        emitOverlayMode({ mode: isAmbient ? 'interactive' : 'ambient' });
    };

    const toggleDebugBg = () => {
        emitDebugAction({ action: 'toggle_debug_bg' });
    };

    const spawnRAMViewer = () => {
        openDevWindow('ram_viewer', 'Global RAM Monitor', 50, 50, 400, 500);
    };

    const buttonClass = 'flex items-center gap-2 bg-zinc-800/80 hover:bg-zinc-700 active:bg-zinc-600 px-3 py-2 rounded text-sm border border-zinc-700/50 duration-75';

    const corePackageWindows = (registryDomains?.windows ?? [])
        .filter((entry) => entry.owner_scope === 'core' && entry.source_scope === 'core' && entry.is_enabled !== false)
        .filter((entry) => entry.name && entry.name !== 'dev_menu' && entry.slug !== 'dev-menu')
        .sort((a, b) => (a.display_name ?? a.window_name ?? '').localeCompare(b.display_name ?? b.window_name ?? ''));

    return (
        <div className="flex flex-col gap-2 w-full h-full text-zinc-300 overflow-y-auto pr-1">
            <div className="text-xs font-semibold text-zinc-500 mb-1 px-1">Core Package Windows (Dynamic)</div>

            {corePackageWindows.length === 0 && (
                <div className="text-xs text-zinc-600 px-2 py-2 border border-zinc-800 rounded">
                    No core package windows found in <code>system:registry_domains</code>.
                </div>
            )}

            {corePackageWindows.map((entry, index) => {
                const preset = entry.default_window_preset;
                const title = preset?.title ?? entry.display_name ?? entry.window_name ?? entry.component_name ?? 'Core Window';
                const width = preset?.width ?? 760;
                const height = preset?.height ?? 520;
                const x = preset?.x ?? 120 + (index * 36);
                const y = preset?.y ?? 70 + (index * 24);
                const componentName = entry.component_name ?? 'system_widget';

                return (
                    <button
                        key={entry.id ?? `${componentName}-${index}`}
                        onClick={() => openDevWindow(componentName, title, x, y, width, height)}
                        className={buttonClass}
                    >
                        <HardDrive size={14} className="text-sky-300" />
                        Open {title}
                    </button>
                );
            })}

            <button
                onClick={() => openDevWindow('event_viewer', 'Event Viewer', 60, 60, 620, 420)}
                className={buttonClass}
            >
                <Activity size={14} className="text-cyan-400" />
                Open Event Viewer
            </button>

            <button
                onClick={spawnRAMViewer}
                className={buttonClass}
            >
                <HardDrive size={14} className="text-emerald-400" />
                Open RAM Viewer
            </button>

            <button
                onClick={() => openDevWindow('ram_usage_analyzer', 'RAM Usage Analyzer', 90, 80, 700, 460)}
                className={buttonClass}
            >
                <HardDrive size={14} className="text-cyan-400" />
                Open RAM Usage Analyzer
            </button>

            <button
                onClick={() => openDevWindow('event_registry_list', 'Event Registry', 110, 90, 520, 420)}
                className={buttonClass}
            >
                <ListTree size={14} className="text-purple-400" />
                Open Event Registry List
            </button>

            <button
                onClick={() => openDevWindow('process_monitor', 'Process Monitor', 160, 120, 560, 420)}
                className={buttonClass}
            >
                <Workflow size={14} className="text-emerald-400" />
                Open Process Monitor
            </button>

            <button
                onClick={() => openDevWindow('tools_registry_list', 'Tools Registry', 210, 150, 520, 380)}
                className={buttonClass}
            >
                <Wrench size={14} className="text-amber-400" />
                Open Tools Registry List
            </button>

            <button
                onClick={() => openDevWindow('pipeline_registry_list', 'Pipeline Registry', 260, 180, 560, 400)}
                className={buttonClass}
            >
                <Layers size={14} className="text-sky-400" />
                Open Pipeline Registry List
            </button>

            <button
                onClick={() => openDevWindow('window_registry_list', 'Window Registry', 310, 210, 520, 380)}
                className={buttonClass}
            >
                <PanelTop size={14} className="text-rose-400" />
                Open Window Registry List
            </button>

            <button
                onClick={() => openDevWindow('fps_widget', 'FPS Counter', 420, 120, 280, 170)}
                className={buttonClass}
            >
                <Gauge size={14} className="text-lime-400" />
                Open FPS Counter
            </button>

            <button
                onClick={() => openDevWindow('stress_test_menu', 'Stress Test Menu', 460, 100, 440, 300)}
                className={buttonClass}
            >
                <Flame size={14} className="text-fuchsia-400" />
                Open Stress Test Menu
            </button>

            <button
                onClick={() => openDevWindow('package_registry_view', 'Package Registry', 360, 120, 800, 500)}
                className={buttonClass}
            >
                <Workflow size={14} className="text-teal-400" />
                Open Package Registry
            </button>

            <button
                onClick={() => openDevWindow('hello_world_component', 'Hello World (Example Package)', 420, 180, 480, 320)}
                className={buttonClass}
            >
                <Activity size={14} className="text-emerald-300" />
                Open Hello World Package
            </button>

            <button
                onClick={() => openDevWindow('system_console', 'System Console', 360, 240, 620, 400)}
                className={buttonClass}
            >
                <HardDrive size={14} className="text-indigo-400" />
                Open System Console
            </button>

            <div className="h-px bg-zinc-700/50 my-2" />
            <div className="text-xs font-semibold text-zinc-500 mb-1 px-1">Window & Layout Tests</div>

            <button
                onClick={() => window.ACE.window.spawnWindow({
                    package: 'itsjiran/ace-system',
                    window: 'system_console',
                    title: 'Locked Terminal',
                    x: 100,
                    y: 100,
                    width: 400,
                    height: 300,
                    is_locked: true
                })}
                className={buttonClass}
            >
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                Spawn Locked Window
            </button>

            <button
                onClick={() => window.ACE.window.spawnWindow({
                    package: 'itsjiran/ace-system',
                    window: 'system_console',
                    title: 'Ghost Terminal (50%)',
                    x: 150,
                    y: 150,
                    width: 400,
                    height: 300,
                    opacity: 0.5
                })}
                className={buttonClass}
            >
                 <div className="w-2 h-2 rounded-full bg-blue-500/50" />
                Spawn Ghost Window
            </button>

             <button
                onClick={() => window.ACE.window.spawnWindow({
                    package: 'itsjiran/ace-system',
                    window: 'system_console',
                    title: 'Always On Top',
                    x: 200,
                    y: 200,
                    width: 400,
                    height: 300,
                    always_on_top: true
                })}
                className={buttonClass}
            >
                 <div className="w-2 h-2 rounded-full bg-emerald-500" />
                Spawn Always-On-Top
            </button>

            <button
                onClick={() => window.ACE.window.spawnWindow({
                    package: 'itsjiran/ace-system-dev',
                    window: 'headless-drag-surface-demo',
                    title: 'Headless Drag Surface',
                    x: 280,
                    y: 140,
                    width: 420,
                    height: 300,
                    chrome_style: 'borderless',
                    drag_surface: 'full'
                })}
                className={buttonClass}
            >
                <div className="w-2 h-2 rounded-full bg-cyan-400" />
                Spawn Headless Full-Drag Window
            </button>

            <button
                onClick={toggleDebugBg}
                className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors border ${isDebugBg ? 'bg-amber-900/40 border-amber-500/50 text-amber-100 hover:bg-amber-800/50' : 'bg-zinc-800/80 border-zinc-700/50 text-zinc-400 hover:bg-zinc-700'}`}
            >
                <PaintBucket size={14} className={isDebugBg ? "text-amber-400" : "text-zinc-500"} />
                {isDebugBg ? 'Hide Layer Bounds' : 'Show Layer Bounds'}
            </button>

            <button
                onClick={toggleOverlayMode}
                className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors border ${isAmbient ? 'bg-zinc-800/80 border-zinc-700/50 text-zinc-400' : 'bg-red-900/40 border-red-500/50 text-red-100 hover:bg-red-800/50'}`}
            >
                <Share2 size={14} className={isAmbient ? "text-blue-400" : "text-red-300"} />
                {isAmbient ? 'Enter Interactive Mode' : 'Exit Interactive Mode'}
            </button>

            <button
                onClick={() => void closeCurrentHostWindow()}
                className="flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors border mt-auto bg-red-950/60 border-red-800/50 text-red-300 hover:bg-red-900/80 hover:text-red-100"
            >
                <Power size={14} className="text-red-400" />
                Quit Application
            </button>
        </div>
    );
}
