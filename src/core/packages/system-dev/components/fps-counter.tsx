// src/core/packages/system-dev/components/fps-counter.tsx
import { useEffect, useState, useRef } from 'react';
import type { AceRegistryType } from '#/schemas/registry-types';

export const registry: AceRegistryType.Component = {
    name: 'FPS Counter',
    slug: 'fps-counter',
    react_behavior: 'fps_counter_display',
};

export default function FPSCounter() {
    const [fps, setFps] = useState(0);
    const framesRef = useRef(0);
    const lastTimeRef = useRef(performance.now());
    const animRef = useRef<number>();

    useEffect(() => {
        const loop = () => {
            framesRef.current++;
            const now = performance.now();
            const delta = now - lastTimeRef.current;

            if (delta >= 1000) {
                setFps(Math.round((framesRef.current * 1000) / delta));
                framesRef.current = 0;
                lastTimeRef.current = now;
            }

            animRef.current = requestAnimationFrame(loop);
        };

        animRef.current = requestAnimationFrame(loop);

        return () => {
            if (animRef.current) cancelAnimationFrame(animRef.current);
        };
    }, []);

    // Color coding based on FPS
    let colorClass = 'text-green-500';
    if (fps < 30) colorClass = 'text-red-500';
    else if (fps < 55) colorClass = 'text-yellow-500';

    return (
        <div className="flex items-center justify-center w-full h-full bg-black/80 text-xs font-mono select-none rounded border border-white/10 shadow-lg">
            <span className={`font-bold ${colorClass}`}>{fps}</span>
            <span className="text-zinc-500 ml-0.5 text-[0.6rem]">FPS</span>
        </div>
    );
}
