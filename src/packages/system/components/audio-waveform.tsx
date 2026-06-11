/**
 * AudioWaveform — renders a waveform visualization from an audio URL.
 *
 * Uses Web Audio API to decode the audio and draw amplitude bars on a canvas.
 */

import React, { useRef, useEffect } from 'react';

interface AudioWaveformProps {
    src: string;
    color?: string;
    height?: number;
    barCount?: number;
}

export function AudioWaveform({
    src,
    color = 'rgba(59, 130, 246, 0.6)',
    height = 40,
    barCount = 40,
}: AudioWaveformProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let cancelled = false;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = canvas.offsetWidth * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);

        fetch(src)
            .then((res) => res.arrayBuffer())
            .then(async (buf) => {
                if (cancelled) return;
                const audioCtx = new AudioContext();
                const audioBuffer = await audioCtx.decodeAudioData(buf);
                audioCtx.close();

                if (cancelled) return;
                drawWaveform(ctx, canvas.offsetWidth, height, audioBuffer, color, barCount);
            })
            .catch(() => {
                if (!cancelled) drawPlaceholder(ctx, canvas.offsetWidth, height, barCount);
            });

        return () => { cancelled = true; };
    }, [src, color, height, barCount]);

    return (
        <canvas
            ref={canvasRef}
            style={{ width: '100%', height }}
            className="rounded-md"
        />
    );
}

function drawWaveform(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    buffer: AudioBuffer,
    color: string,
    bars: number,
) {
    const data = buffer.getChannelData(0);
    const step = Math.floor(data.length / bars);
    const gap = 2;
    const barW = (w - (bars - 1) * gap) / bars;
    const mid = h / 2;

    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < bars; i++) {
        let max = 0;
        const start = i * step;
        const end = Math.min(start + step, data.length);
        for (let j = start; j < end; j++) {
            const v = Math.abs(data[j]);
            if (v > max) max = v;
        }

        const barH = Math.max(2, max * mid * 2);
        const x = i * (barW + gap);
        const y = mid - barH / 2;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, 1);
        ctx.fill();
    }
}

function drawPlaceholder(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    bars: number,
) {
    const gap = 2;
    const barW = (w - (bars - 1) * gap) / bars;
    const mid = h / 2;

    ctx.clearRect(0, 0, w, h);

    for (let i = 0; i < bars; i++) {
        const barH = Math.max(2, Math.random() * mid * 1.2);
        const x = i * (barW + gap);
        const y = mid - barH / 2;

        ctx.fillStyle = 'rgba(113, 113, 122, 0.3)';
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, 1);
        ctx.fill();
    }
}
