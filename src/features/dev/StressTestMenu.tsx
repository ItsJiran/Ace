import { WindowEngine } from '#/services/windowEngine';

export function StressTestMenu() {
    const openUiAnimationFpsTest = () => {
        WindowEngine.spawnWindow({
            component_name: 'stress_test_ui_animation_fps',
            title: 'Stress Test: UI Animation FPS',
            x: 180,
            y: 100,
            width: 760,
            height: 520,
        });
    };

    const openPromptResponseLoadTest = () => {
        WindowEngine.spawnWindow({
            component_name: 'stress_test_prompt_response_load',
            title: 'Stress Test: Prompt + AI Response Load',
            x: 200,
            y: 120,
            width: 900,
            height: 620,
        });
    };

    const openChatMessageFlowTest = () => {
        WindowEngine.spawnWindow({
            component_name: 'stress_test_chat_message_flow',
            title: 'Stress Test: Chat Message Flow',
            x: 220,
            y: 140,
            width: 900,
            height: 620,
        });
    };

    const openWindowMotionTest = () => {
        WindowEngine.spawnWindow({
            component_name: 'stress_test_window_motion',
            title: 'Stress Test: Window Motion',
            x: 400,
            y: 250,
            width: 480,
            height: 480,
        });
    };

    const openWindowSwarmTest = () => {
        WindowEngine.spawnWindow({
            component_name: 'stress_test_window_swarm',
            title: 'Stress Test: Window Swarm',
            x: 420,
            y: 270,
            width: 480,
            height: 520,
        });
    };

    const openRAMIsolationTest = () => {
        WindowEngine.spawnWindow({
            component_name: 'stress_test_ram_isolation',
            title: 'Stress Test: RAM Isolation',
            x: 440,
            y: 160,
            width: 520,
            height: 640,
        });
    };

    return (
        <div className="h-full w-full rounded-xl border border-zinc-800 bg-zinc-950/90 p-3 flex flex-col gap-3">
            <div>
                <p className="text-xs font-semibold text-fuchsia-300">Stress Test Menu</p>
                <p className="text-[11px] text-zinc-500">Run heavy scenarios for performance validation.</p>
            </div>

            <button
                onClick={openUiAnimationFpsTest}
                className="w-full text-left rounded border border-zinc-700/70 bg-zinc-900/80 px-3 py-2 hover:bg-zinc-800 active:bg-zinc-700 transition-colors"
            >
                <p className="text-sm text-zinc-200">UI Animation FPS</p>
                <p className="text-[11px] text-zinc-500">Spawn many animated nodes and monitor frame pacing.</p>
            </button>

            <button
                onClick={openPromptResponseLoadTest}
                className="w-full text-left rounded border border-zinc-700/70 bg-zinc-900/80 px-3 py-2 hover:bg-zinc-800 active:bg-zinc-700 transition-colors"
            >
                <p className="text-sm text-zinc-200">Prompt + AI Response Load</p>
                <p className="text-[11px] text-zinc-500">Simulate multi-chat prompt flow and heavy AI token streaming with optional RAM writes.</p>
            </button>

            <button
                onClick={openChatMessageFlowTest}
                className="w-full text-left rounded border border-zinc-700/70 bg-zinc-900/80 px-3 py-2 hover:bg-zinc-800 active:bg-zinc-700 transition-colors"
            >
                <p className="text-sm text-zinc-200">Chat Message Flow</p>
                <p className="text-[11px] text-zinc-500">Simulate animated user-AI message exchange like chat page traffic.</p>
            </button>

            <div className="border-t border-zinc-800 pt-2">
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Window Animation</p>
            </div>

            <button
                onClick={openWindowMotionTest}
                className="w-full text-left rounded border border-zinc-700/70 bg-zinc-900/80 px-3 py-2 hover:bg-zinc-800 active:bg-zinc-700 transition-colors"
            >
                <p className="text-sm text-zinc-200">Window Motion</p>
                <p className="text-[11px] text-zinc-500">Animasi posisi & ukuran window via RAF — bounce, figure-8, pop scale, spring snap.</p>
            </button>

            <button
                onClick={openWindowSwarmTest}
                className="w-full text-left rounded border border-zinc-700/70 bg-zinc-900/80 px-3 py-2 hover:bg-zinc-800 active:bg-zinc-700 transition-colors"
            >
                <p className="text-sm text-zinc-200">Window Swarm</p>
                <p className="text-[11px] text-zinc-500">Spawn & animasikan beberapa window secara concurrent — orbital, bounce grid, scatter spring.</p>
            </button>

            <div className="border-t border-zinc-800 pt-2">
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Reactivity</p>
            </div>

            <button
                onClick={openRAMIsolationTest}
                className="w-full text-left rounded border border-zinc-700/70 bg-zinc-900/80 px-3 py-2 hover:bg-zinc-800 active:bg-zinc-700 transition-colors"
            >
                <p className="text-sm text-zinc-200">RAM Isolation</p>
                <p className="text-[11px] text-zinc-500">Flood global RAM dengan key asing sambil animasi jalan — buktikan FPS tidak turun karena O(1) socket isolation.</p>
            </button>
        </div>
    );
}
