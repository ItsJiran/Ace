import { useState, useEffect, useRef, useMemo } from 'react';
import { Terminal, AlertTriangle, Info, XCircle, Play, Trash2 } from 'lucide-react';
import { useAceMemory } from '#/hooks/useAceMemory';
import { AceWindow } from '#/components/layout/AceWindow';
import type { AceRegistryType } from '#/schemas/registryTypes';

export const registry: AceRegistryType.Component = {
    name: 'ace_devtools',
    slug: 'ace-devtools',
};

// Type definitions matching LoggerEngine
export type LogLevel = 'log' | 'info' | 'warn' | 'error';

export interface LogEntry {
    timestamp: number;
    level: LogLevel;
    message: string;
    id: string;
}

export default function AceDevTools({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid}>
            <AceDevToolsContent />
        </AceWindow>
    );
}

function AceDevToolsContent() {
    const [filter, setFilter] = useState<string>('all');
    const [search, setSearch] = useState('');
    const [command, setCommand] = useState('');
    const logs = useAceMemory<LogEntry[]>('system:logs') || [];
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, filter]);

    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            if (filter !== 'all' && log.level !== filter) return false;
            if (search && !log.message.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        });
    }, [logs, filter, search]);

    const executeCommand = () => {
        if (!command.trim()) return;
        
        console.log(`> ${command}`);
        
        try {
            // eslint-disable-next-line no-eval
            const result = (window as any).eval(command);
            console.log('<', result);
        } catch (err) {
            console.error('Command Error:', err);
        }
        
        setCommand('');
    };

    const handleCommandKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            executeCommand();
        }
    };

    const clearLogs = () => {
         if (window.ACE?.storage) {
             window.ACE.storage.dispatchRAMAction({
                 action: 'create_memory',
                 memory_uid: 'system:logs',
                 payload: [],
                 classifications: ['system:core']
             });
         }
    };

    return (
        <div className="flex flex-col h-full bg-zinc-950 text-zinc-300 font-mono text-[11px] overflow-hidden">
            {/* Toolbar */}
            <div className="h-8 border-b border-zinc-800 flex items-center px-2 gap-2 bg-zinc-900/50 shrink-0">
                <div className="flex items-center gap-1.5 text-zinc-400 select-none mr-2">
                    <Terminal size={12} />
                    <span className="font-bold">Events</span>
                </div>

                <div className="h-4 w-px bg-zinc-800 mx-1" />

                <button 
                    onClick={clearLogs}
                    className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-red-400"
                    title="Clear Console"
                >
                    <Trash2 size={12} />
                </button>

                <div className="h-4 w-px bg-zinc-800 mx-1" />

                <input 
                    type="text" 
                    placeholder="Filter..." 
                    className="bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5 w-32 focus:outline-none focus:border-zinc-700 text-zinc-200 placeholder:text-zinc-600"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />

                <select 
                    className="bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5 focus:outline-none focus:border-zinc-700 text-zinc-200"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                >
                    <option value="all">All Levels</option>
                    <option value="log">Log</option>
                    <option value="info">Info</option>
                    <option value="warn">Warn</option>
                    <option value="error">Error</option>
                </select>
            </div>

            {/* Logs Area */}
            <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-2 space-y-0.5"
            >
                {filteredLogs.map((log) => (
                    <div key={log.id} className={`flex gap-2 hover:bg-white/5 px-1 py-0.5 rounded-sm break-all ${
                        log.level === 'error' ? 'bg-red-950/20 text-red-300' :
                        log.level === 'warn' ? 'bg-yellow-950/10 text-amber-300' :
                        'text-zinc-300'
                    }`}>
                        <span className="text-zinc-600 shrink-0 select-none w-16">
                            {new Date(log.timestamp).toLocaleTimeString().split(' ')[0]}.{new Date(log.timestamp).getMilliseconds().toString().padStart(3, '0')}
                        </span>
                        
                        <div className="shrink-0 w-4 flex justify-center mt-0.5">
                            {log.level === 'error' && <XCircle size={10} className="text-red-500" />}
                            {log.level === 'warn' && <AlertTriangle size={10} className="text-amber-500" />}
                            {log.level === 'info' && <Info size={10} className="text-blue-500" />}
                        </div>

                        <span className="whitespace-pre-wrap">{log.message}</span>
                    </div>
                ))}
                {filteredLogs.length === 0 && (
                    <div className="text-zinc-600 italic px-2">No logs found.</div>
                )}
            </div>

            {/* Command Input */}
            <div className="h-8 border-t border-zinc-800 flex items-center bg-zinc-900/80 px-2 gap-2 shrink-0">
                <Play size={10} className="text-blue-400 shrink-0" />
                <input 
                    ref={inputRef}
                    type="text" 
                    className="flex-1 bg-transparent border-none focus:outline-none text-zinc-200 placeholder:text-zinc-700"
                    placeholder="Execute JS (e.g. console.log(window.ACE))"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={handleCommandKeyDown}
                />
            </div>
        </div>
    );
}
