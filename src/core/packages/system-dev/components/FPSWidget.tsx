import type { AceRegistryType } from '#/schemas/registryTypes';
import { useEffect, useRef, useState } from 'react';

export const registry: AceRegistryType.Component = {
    name: 'fps_widget_ui',
    react_behavior: 'dev_fps_counter',
};

export function FPSWidget() {
    const [fps, setFps] = useState(0);
    const [frameMs, setFrameMs] = useState(0);
    const lastTsRef = useRef<number>(performance.now());
    const framesRef = useRef(0);

    useEffect(() => {
        let rafId = 0;

        const tick = (ts: number) => {
            framesRef.current += 1;
            const delta = ts - lastTsRef.current;

            if (delta >= 1000) {
                const nextFps = Math.round((framesRef.current * 1000) / delta);
                setFps(nextFps);
                setFrameMs(Number((1000 / Math.max(nextFps, 1)).toFixed(1)));
                framesRef.current = 0;
                lastTsRef.current = ts;
            }

            rafId = window.requestAnimationFrame(tick);
        };

        rafId = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(rafId);
    }, []);

    const tone = fps >= 55 ? 'text-emerald-300' : fps >= 30 ? 'text-amber-300' : 'text-red-300';

    return (
        <div className="h-full w-full rounded-xl border border-zinc-800 bg-zinc-950/90 p-3 font-mono">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">FPS Counter</p>
            <div className="text-3xl font-bold leading-none mb-2">
                <span className={tone}>{fps}</span>
                <span className="text-sm text-zinc-500 ml-2">fps</span>
            </div>
            <p className="text-[12px] text-zinc-400">frame time: {frameMs} ms</p>
            <div className="mt-3 h-2 rounded bg-zinc-800 overflow-hidden">
                <div
                    className={`h-full transition-all duration-300 ${fps >= 55 ? 'bg-emerald-500' : fps >= 30 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${Math.min(100, Math.max(0, (fps / 60) * 100))}%` }}
                />
            </div>
        </div>
    );
}
