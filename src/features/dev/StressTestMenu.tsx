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
        </div>
    );
}
