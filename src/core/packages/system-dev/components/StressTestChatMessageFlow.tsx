import { useEffect, useMemo, useRef, useState } from 'react';

type ChatMessage = {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    createdAt: number;
};

const USER_PROMPTS = [
    'Bisa rangkum progress hari ini?',
    'Tolong cek bottleneck render di drag window.',
    'Kenapa hover menu masih delay?',
    'Buatkan checklist optimasi UI untuk Linux compositor.',
    'Coba jelasin pipeline event ke storage secara singkat.',
    'Tolong generate langkah debug kalau FPS drop saat stream.',
];

const AI_TOKENS = [
    'Baik', 'saya', 'akan', 'analisa', 'alur', 'render', 'dan', 'fokus', 'pada', 'jalur',
    'event', 'storage', 'commit', 'state', 'untuk', 'mengurangi', 'overhead', 'serta', 'menjaga',
    'frame', 'tetap', 'stabil', 'di', 'beban', 'streaming', 'yang', 'tinggi', 'secara', 'bertahap',
];

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const makeAiMessage = (tokenCount: number) => {
    const words: string[] = [];

    for (let i = 0; i < tokenCount; i += 1) {
        words.push(AI_TOKENS[randomInt(0, AI_TOKENS.length - 1)]);
    }

    const sentence = words.join(' ');
    return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
};

const makeUserMessage = () => USER_PROMPTS[randomInt(0, USER_PROMPTS.length - 1)];

export function StressTestChatMessageFlow() {
    const [isRunning, setIsRunning] = useState(false);
    const [fps, setFps] = useState(0);
    const [messages, setMessages] = useState<ChatMessage[]>([]);

    const [tickMs, setTickMs] = useState(80);
    const [batchPairCount, setBatchPairCount] = useState(2);
    const [aiTokenCount, setAiTokenCount] = useState(28);
    const [maxMessages, setMaxMessages] = useState(500);
    const [autoScroll, setAutoScroll] = useState(true);

    const messageContainerRef = useRef<HTMLDivElement | null>(null);
    const frameRef = useRef(0);
    const lastFpsTsRef = useRef(performance.now());
    const msgsInSecondRef = useRef(0);
    const [messagesPerSecond, setMessagesPerSecond] = useState(0);
    const [totalMessages, setTotalMessages] = useState(0);

    useEffect(() => {
        if (!isRunning) return;

        let rafId = 0;

        const animate = (ts: number) => {
            frameRef.current += 1;
            const delta = ts - lastFpsTsRef.current;

            if (delta >= 1000) {
                setFps(Math.round((frameRef.current * 1000) / delta));
                setMessagesPerSecond(msgsInSecondRef.current);
                frameRef.current = 0;
                msgsInSecondRef.current = 0;
                lastFpsTsRef.current = ts;
            }

            rafId = window.requestAnimationFrame(animate);
        };

        rafId = window.requestAnimationFrame(animate);
        return () => window.cancelAnimationFrame(rafId);
    }, [isRunning]);

    useEffect(() => {
        if (!isRunning) return;

        const id = window.setInterval(() => {
            const now = Date.now();
            const nextMessages: ChatMessage[] = [];

            for (let i = 0; i < batchPairCount; i += 1) {
                nextMessages.push({
                    id: `u-${now}-${i}-${Math.random().toString(36).slice(2, 7)}`,
                    role: 'user',
                    text: makeUserMessage(),
                    createdAt: now,
                });

                nextMessages.push({
                    id: `a-${now}-${i}-${Math.random().toString(36).slice(2, 7)}`,
                    role: 'assistant',
                    text: makeAiMessage(aiTokenCount),
                    createdAt: now,
                });
            }

            msgsInSecondRef.current += nextMessages.length;
            setTotalMessages((prev) => prev + nextMessages.length);

            setMessages((prev) => {
                const merged = [...prev, ...nextMessages];
                if (merged.length <= maxMessages) return merged;
                return merged.slice(merged.length - maxMessages);
            });
        }, tickMs);

        return () => window.clearInterval(id);
    }, [isRunning, tickMs, batchPairCount, aiTokenCount, maxMessages]);

    useEffect(() => {
        if (!autoScroll) return;
        const el = messageContainerRef.current;
        if (!el) return;

        el.scrollTop = el.scrollHeight;
    }, [messages, autoScroll]);

    const resetAll = () => {
        setIsRunning(false);
        setMessages([]);
        setFps(0);
        setMessagesPerSecond(0);
        setTotalMessages(0);
        frameRef.current = 0;
        msgsInSecondRef.current = 0;
        lastFpsTsRef.current = performance.now();
    };

    const fpsTone = fps >= 55 ? 'text-emerald-300' : fps >= 35 ? 'text-amber-300' : 'text-red-300';

    const summary = useMemo(() => {
        let userCount = 0;
        let aiCount = 0;

        for (const msg of messages) {
            if (msg.role === 'user') userCount += 1;
            else aiCount += 1;
        }

        return { userCount, aiCount };
    }, [messages]);

    return (
        <div className="h-full w-full rounded-xl border border-zinc-800 bg-zinc-950/90 p-3 flex flex-col gap-3 overflow-hidden">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-semibold text-fuchsia-300">Stress Test: Chat Message Flow</p>
                    <p className="text-[11px] text-zinc-500">Simulasi percakapan user-AI dengan animasi bubble masuk untuk profiling performa halaman chat.</p>
                </div>
                <div className="text-right font-mono">
                    <div className="text-[11px] text-zinc-500">FPS</div>
                    <div className={`text-2xl leading-none ${fpsTone}`}>{fps}</div>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                <div className="rounded border border-zinc-800 bg-zinc-900/60 p-2">
                    <p className="text-zinc-500">msg/sec</p>
                    <p className="font-mono text-zinc-200 text-sm">{messagesPerSecond}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-zinc-900/60 p-2">
                    <p className="text-zinc-500">rendered msgs</p>
                    <p className="font-mono text-zinc-200 text-sm">{messages.length}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-zinc-900/60 p-2">
                    <p className="text-zinc-500">user / ai</p>
                    <p className="font-mono text-zinc-200 text-sm">{summary.userCount} / {summary.aiCount}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-zinc-900/60 p-2">
                    <p className="text-zinc-500">total generated</p>
                    <p className="font-mono text-zinc-200 text-sm">{totalMessages}</p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                    onClick={() => setIsRunning((v) => !v)}
                    className={`rounded border px-3 py-1 transition-colors ${isRunning ? 'bg-red-900/40 border-red-600/60 text-red-200 hover:bg-red-800/50' : 'bg-emerald-900/40 border-emerald-600/60 text-emerald-200 hover:bg-emerald-800/50'}`}
                >
                    {isRunning ? 'Stop Simulation' : 'Start Simulation'}
                </button>

                <button
                    onClick={resetAll}
                    className="rounded border border-zinc-700 bg-zinc-900/80 px-3 py-1 text-zinc-200 hover:bg-zinc-800"
                >
                    Reset
                </button>

                <button
                    onClick={() => setTickMs((v) => Math.max(16, v - 8))}
                    className="rounded border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-zinc-200 hover:bg-zinc-800"
                >
                    faster
                </button>

                <span className="text-zinc-500">tick: {tickMs}ms</span>

                <button
                    onClick={() => setTickMs((v) => Math.min(240, v + 8))}
                    className="rounded border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-zinc-200 hover:bg-zinc-800"
                >
                    slower
                </button>

                <button
                    onClick={() => setBatchPairCount((v) => Math.max(1, v - 1))}
                    className="rounded border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-zinc-200 hover:bg-zinc-800"
                >
                    - pair
                </button>

                <span className="text-zinc-500">pairs/tick: {batchPairCount}</span>

                <button
                    onClick={() => setBatchPairCount((v) => Math.min(10, v + 1))}
                    className="rounded border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-zinc-200 hover:bg-zinc-800"
                >
                    + pair
                </button>

                <button
                    onClick={() => setAiTokenCount((v) => Math.max(8, v - 4))}
                    className="rounded border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-zinc-200 hover:bg-zinc-800"
                >
                    - token
                </button>

                <span className="text-zinc-500">ai tokens: {aiTokenCount}</span>

                <button
                    onClick={() => setAiTokenCount((v) => Math.min(120, v + 4))}
                    className="rounded border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-zinc-200 hover:bg-zinc-800"
                >
                    + token
                </button>

                <button
                    onClick={() => setMaxMessages((v) => Math.max(100, v - 50))}
                    className="rounded border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-zinc-200 hover:bg-zinc-800"
                >
                    - cap
                </button>

                <span className="text-zinc-500">max msgs: {maxMessages}</span>

                <button
                    onClick={() => setMaxMessages((v) => Math.min(3000, v + 50))}
                    className="rounded border border-zinc-700 bg-zinc-900/80 px-2 py-1 text-zinc-200 hover:bg-zinc-800"
                >
                    + cap
                </button>

                <button
                    onClick={() => setAutoScroll((v) => !v)}
                    className={`rounded border px-2 py-1 transition-colors ${autoScroll ? 'border-cyan-600/60 bg-cyan-900/30 text-cyan-200' : 'border-zinc-700 bg-zinc-900/80 text-zinc-300'}`}
                >
                    auto-scroll: {autoScroll ? 'ON' : 'OFF'}
                </button>
            </div>

            <div
                ref={messageContainerRef}
                className="flex-1 min-h-0 overflow-auto rounded border border-zinc-800 bg-black/35 p-3 space-y-2"
            >
                {messages.map((msg) => {
                    const isUser = msg.role === 'user';
                    return (
                        <div key={msg.id} className={`w-full flex ${isUser ? 'justify-end' : 'justify-start'} animate-[chat-pop_180ms_ease-out_both]`}>
                            <div className={`max-w-[86%] rounded-2xl px-3 py-2 border ${isUser ? 'bg-sky-900/40 border-sky-700/60 text-sky-100' : 'bg-zinc-900/85 border-zinc-700/70 text-zinc-200'}`}>
                                <p className="text-[11px] leading-relaxed">{msg.text}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            <style>{`
                @keyframes chat-pop {
                    from { transform: translate3d(0, 10px, 0) scale(0.98); opacity: 0; }
                    to { transform: translate3d(0, 0, 0) scale(1); opacity: 1; }
                }
            `}</style>
        </div>
    );
}
