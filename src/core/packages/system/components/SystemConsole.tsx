import type { AceRegistryType } from '#/schemas/registryTypes';
import React, { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';

export type LogLevel = 'log' | 'info' | 'warn' | 'error';

export interface LogEntry {
    timestamp: number;
    level: LogLevel;
    message: string;
    id: string;
}

export const registry: AceRegistryType.Component = {
    name: 'system_console',
    data_requirements: ['system:logs'],
    react_behavior: 'system_log_console',
};

export const SystemConsole: React.FC = () => {
    const logs = window.ACE.memory.use<LogEntry[]>('system:logs') || [];
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    const getLevelColor = (level: string) => {
        switch (level) {
            case 'error': return 'text-red-400';
            case 'warn': return 'text-amber-400';
            case 'info': return 'text-blue-400';
            default: return 'text-zinc-300';
        }
    };

    return (
        <div className="w-full h-full flex flex-col bg-zinc-950/90 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden shadow-2xl">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-white/5">
                <Terminal size={14} className="text-zinc-400" />
                <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-400">System Logs</span>
            </div>

            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed space-y-1 selection:bg-blue-500/30"
            >
                {logs.length === 0 && (
                    <div className="text-zinc-600 italic">No logs captured yet...</div>
                )}
                {logs.map((log) => (
                    <div key={log.id} className="flex gap-2 group">
                        <span className="text-zinc-600 shrink-0">
                            [{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]
                        </span>
                        <span className={`uppercase font-bold shrink-0 ${getLevelColor(log.level)}`}>
                            {log.level.padEnd(5)}
                        </span>
                        <span className="break-all whitespace-pre-wrap text-zinc-300 group-hover:text-white transition-colors">
                            {log.message}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SystemConsole;
