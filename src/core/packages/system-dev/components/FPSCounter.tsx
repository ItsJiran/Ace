import type { AceRegistryType } from '#/schemas/registryTypes';
import { useEffect, useRef, useState } from 'react';

export const registry: AceRegistryType.Component = {
    name: 'fps_counter',
    react_behavior: 'dev_fps_overlay',
};

export default function FPSCounter() {
    const [fps, setFps] = useState(0);
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
                framesRef.current = 0;
                lastTsRef.current = ts;
            }

            rafId = window.requestAnimationFrame(tick);
        };

        rafId = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(rafId);
    }, []);

    const levelClass = fps >= 55 ? 'text-emerald-300' : fps >= 30 ? 'text-amber-300' : 'text-red-300';

    return (
        <div className="absolute top-2 right-2 pointer-events-none z-[9999] rounded bg-black/65 border border-white/15 px-2 py-1 text-[11px] font-mono">
            <span className="text-zinc-400 mr-1">FPS</span>
            <span className={levelClass}>{fps}</span>
        </div>
    );
}
