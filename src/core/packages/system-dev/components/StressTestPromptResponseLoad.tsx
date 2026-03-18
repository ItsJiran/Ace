import type { AceRegistryType } from '#/schemas/registryTypes';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Storage } from '#/services/storageEngine';

type ChatStream = {
    id: string;
    prompt: string;
    response: string;
    completed: boolean;
    generatedChars: number;
};

const PROMPT_LIBRARY = [
    'Summarize today\'s project commits and risks.',
    'Generate a release checklist for desktop packaging.',
    'Explain why drag interactions can drop FPS on Linux compositors.',
    'Draft a prompt engineering strategy for reliable tool calls.',
    'Refactor this architecture note into concise implementation steps.',
    'Create a debugging plan for high-frequency UI rendering issues.',
];

const TOKEN_LIBRARY = [
    'analysis', 'pipeline', 'event', 'context', 'scheduler', 'memory', 'render', 'frame',
    'latency', 'throughput', 'parser', 'gateway', 'interaction', 'observer', 'socket', 'state',
    'optimization', 'batch', 'response', 'stream', 'tooling', 'focus', 'buffer', 'stability',
];

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const makeChunk = (targetLength: number) => {
    let chunk = '';

    while (chunk.length < targetLength) {
        const token = TOKEN_LIBRARY[randomInt(0, TOKEN_LIBRARY.length - 1)];
        chunk += `${token}${Math.random() > 0.86 ? '. ' : ' '}`;
    }

    return chunk.slice(0, targetLength);
};

const createInitialStreams = (count: number): ChatStream[] => {
    return Array.from({ length: count }).map((_, i) => ({
        id: `sim-chat-${i + 1}`,
        prompt: PROMPT_LIBRARY[i % PROMPT_LIBRARY.length],
        response: '',
        completed: false,
        generatedChars: 0,
    }));
};

export const registry: AceRegistryType.Component = {
    name: 'stress_test_prompt_response_load',
    react_behavior: 'dev_stress_prompt_response',
};

export function StressTestPromptResponseLoad() {
    const [isRunning, setIsRunning] = useState(false);
    const [fps, setFps] = useState(0);
    const [chatCount, setChatCount] = useState(4);
    const [chunkSize, setChunkSize] = useState(120);
    const [tickMs, setTickMs] = useState(45);
    const [targetCharsPerChat, setTargetCharsPerChat] = useState(9000);
    const [writeToRam, setWriteToRam] = useState(true);
    const [streams, setStreams] = useState<ChatStream[]>(() => createInitialStreams(4));

    const totalCharsRef = useRef(0);
    const charsInSecondRef = useRef(0);
    const lastSampleTsRef = useRef(performance.now());
    const framesRef = useRef(0);

    const [charsPerSecond, setCharsPerSecond] = useState(0);
    const [totalGeneratedChars, setTotalGeneratedChars] = useState(0);

    const runningSummary = useMemo(() => {
        const completedCount = streams.filter((s) => s.completed).length;
        return {
            completedCount,
            activeCount: streams.length - completedCount,
        };
    }, [streams]);

    useEffect(() => {
        if (!isRunning) return;

        let rafId = 0;

        const rafTick = (ts: number) => {
            framesRef.current += 1;
            const dt = ts - lastSampleTsRef.current;

            if (dt >= 1000) {
                setFps(Math.round((framesRef.current * 1000) / dt));
                setCharsPerSecond(charsInSecondRef.current);
                setTotalGeneratedChars(totalCharsRef.current);

                framesRef.current = 0;
                charsInSecondRef.current = 0;
                lastSampleTsRef.current = ts;
            }

            rafId = window.requestAnimationFrame(rafTick);
        };

        rafId = window.requestAnimationFrame(rafTick);

        return () => window.cancelAnimationFrame(rafId);
    }, [isRunning]);

    useEffect(() => {
        if (!isRunning) return;

        const intervalId = window.setInterval(() => {
            const snapshot = streams;
            if (snapshot.length === 0) return;

            let hasChanges = false;
            const nextStreams = snapshot.map((stream) => {
                if (stream.completed) return stream;
                if (stream.generatedChars >= targetCharsPerChat) {
                    hasChanges = true;
                    return { ...stream, completed: true };
                }

                const nextChunk = makeChunk(chunkSize);
                const nextGenerated = stream.generatedChars + nextChunk.length;
                const isCompleted = nextGenerated >= targetCharsPerChat;

                charsInSecondRef.current += nextChunk.length;
                totalCharsRef.current += nextChunk.length;
                hasChanges = true;

                const nextState: ChatStream = {
                    ...stream,
                    response: `${stream.response}${nextChunk}`,
                    generatedChars: nextGenerated,
                    completed: isCompleted,
                };

                if (writeToRam) {
                    Storage.dispatchRAMAction({
                        action: 'create_memory',
                        memory_uid: `stress:prompt_response:${stream.id}`,
                        payload: {
                            prompt: nextState.prompt,
                            response: nextState.response,
                            completed: nextState.completed,
                            generatedChars: nextState.generatedChars,
                            updated_at: Date.now(),
                        },
                        classifications: ['system:stress'],
                    });
                }

                return nextState;
            });

            if (!hasChanges) {
                setIsRunning(false);
                return;
            }

            setStreams(nextStreams);
        }, tickMs);

        return () => window.clearInterval(intervalId);
    }, [isRunning, chunkSize, tickMs, targetCharsPerChat, writeToRam, streams]);

    const resetScenario = () => {
        setIsRunning(false);
        setStreams(createInitialStreams(chatCount));
        totalCharsRef.current = 0;
        charsInSecondRef.current = 0;
        framesRef.current = 0;
        lastSampleTsRef.current = performance.now();
        setCharsPerSecond(0);
        setTotalGeneratedChars(0);
        setFps(0);
    };

    const applyChatCount = (delta: number) => {
        setChatCount((prev) => {
            const next = Math.min(12, Math.max(1, prev + delta));
            setStreams(createInitialStreams(next));
            return next;
        });
    };

    const fpsTone = fps >= 55 ? 'text-emerald-300' : fps >= 35 ? 'text-amber-300' : 'text-red-300';

    return (
        <div className="h-full w-full rounded-xl border border-zinc-800 bg-zinc-950/90 p-3 flex flex-col gap-3 overflow-hidden">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold text-fuchsia-300">Stress Test: Prompt + AI Response Load</p>
                    <p className="text-[11px] text-zinc-500">Simulates concurrent chats with heavy AI token streaming and optional RAM writes.</p>
                </div>
                <div className="text-right font-mono">
                    <div className="text-[11px] text-zinc-500">FPS</div>
                    <div className={`text-2xl leading-none ${fpsTone}`}>{fps}</div>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                <div className="rounded border border-zinc-800 bg-zinc-900/60 p-2">
                    <p className="text-zinc-500">chars/sec</p>
                    <p className="font-mono text-zinc-200 text-sm">{charsPerSecond}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-zinc-900/60 p-2">
                    <p className="text-zinc-500">total chars</p>
                    <p className="font-mono text-zinc-200 text-sm">{totalGeneratedChars}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-zinc-900/60 p-2">
                    <p className="text-zinc-500">active chats</p>
                    <p className="font-mono text-zinc-200 text-sm">{runningSummary.activeCount}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-zinc-900/60 p-2">
                    <p className="text-zinc-500">completed chats</p>
                    <p className="font-mono text-zinc-200 text-sm">{runningSummary.completedCount}</p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                    onClick={() => setIsRunning((v) => !v)}
                    className={`rounded border px-3 py-1 transition-colors ${isRunning ? 'bg-red-900/40 border-red-600/60 text-red-200 hover:bg-red-800/50' : 'bg-emerald-900/40 border-emerald-600/60 text-emerald-200 hover:bg-emerald-800/50'}`}
                >
                    {isRunning ? 'Stop Stream' : 'Start Stream'}
                </button>

                <button
                    onClick={resetScenario}
                    className="rounded border border-zinc-700 bg-zinc-900/80 px-3 py-1 text-zinc-200 hover:bg-zinc-800"
                >
                    Reset
                </button>

                <button
                    onClick={() => applyChatCount(-1)}
                    className="rounded border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-zinc-200 hover:bg-zinc-800"
                >
                    - chat
                </button>

                <span className="text-zinc-500">chat count: {chatCount}</span>

                <button
                    onClick={() => applyChatCount(1)}
                    className="rounded border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-zinc-200 hover:bg-zinc-800"
                >
                    + chat
                </button>

                <button
                    onClick={() => setChunkSize((v) => Math.max(40, v - 20))}
                    className="rounded border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-zinc-200 hover:bg-zinc-800"
                >
                    - chunk
                </button>

                <span className="text-zinc-500">chunk: {chunkSize}</span>

                <button
                    onClick={() => setChunkSize((v) => Math.min(500, v + 20))}
                    className="rounded border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-zinc-200 hover:bg-zinc-800"
                >
                    + chunk
                </button>

                <button
                    onClick={() => setTickMs((v) => Math.min(120, v + 5))}
                    className="rounded border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-zinc-200 hover:bg-zinc-800"
                >
                    + tick
                </button>

                <span className="text-zinc-500">tick: {tickMs}ms</span>

                <button
                    onClick={() => setTickMs((v) => Math.max(10, v - 5))}
                    className="rounded border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-zinc-200 hover:bg-zinc-800"
                >
                    - tick
                </button>

                <button
                    onClick={() => setTargetCharsPerChat((v) => Math.max(3000, v - 1500))}
                    className="rounded border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-zinc-200 hover:bg-zinc-800"
                >
                    - target
                </button>

                <span className="text-zinc-500">target/chat: {targetCharsPerChat}</span>

                <button
                    onClick={() => setTargetCharsPerChat((v) => Math.min(30000, v + 1500))}
                    className="rounded border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-zinc-200 hover:bg-zinc-800"
                >
                    + target
                </button>

                <button
                    onClick={() => setWriteToRam((v) => !v)}
                    className={`rounded border px-2 py-1 transition-colors ${writeToRam ? 'border-cyan-600/60 bg-cyan-900/30 text-cyan-200' : 'border-zinc-700 bg-zinc-900/80 text-zinc-300'}`}
                >
                    RAM write: {writeToRam ? 'ON' : 'OFF'}
                </button>
            </div>

            <div className="flex-1 min-h-0 overflow-auto rounded border border-zinc-800 bg-black/30 p-2 space-y-2">
                {streams.map((stream) => (
                    <div key={stream.id} className="rounded border border-zinc-800 bg-zinc-950/80 p-2">
                        <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="text-zinc-500 font-mono">{stream.id}</span>
                            <span className={stream.completed ? 'text-emerald-300' : 'text-amber-300'}>
                                {stream.completed ? 'completed' : 'streaming'}
                            </span>
                        </div>

                        <p className="text-xs text-cyan-200 mb-1">Prompt: {stream.prompt}</p>
                        <p className="text-[11px] leading-relaxed text-zinc-300 line-clamp-4">{stream.response || '...'}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
