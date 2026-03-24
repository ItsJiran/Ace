import type { AceRegistryType } from '#/schemas/registryTypes';
import { AceWindow } from '#/components/layout/AceWindow';
import { X, Terminal } from 'lucide-react';
import SystemConsole from '../components/SystemConsole';

export const registry: AceRegistryType.Window = {
    name: 'System Console Window',
    slug: 'system-console-window',
    icon_slug: 'terminal',
    react_behavior: 'window_shell',
};

export default function SystemConsoleWindow({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid} headless>
            {({ dragHandleProps, close, isFocused, isDragging }) => (
                <div 
                    className={`w-full h-full flex flex-col transition-colors rounded-xl overflow-hidden ${
                         // PERF: Disable expensive backdrop blur completely
                        isDragging ? 'bg-zinc-950/95' : ''
                    } ${
                        isFocused 
                            ? 'bg-zinc-950/90 shadow-black/50 ring-1 ring-white/10' 
                            : 'bg-zinc-950/70 shadow-black/20 ring-1 ring-white/5'
                    }`}
                >
                    {/* Window Chrome / Titlebar */}
                    <div 
                        {...dragHandleProps}
                        className={`flex items-center justify-between px-3 py-2 border-b bg-white/5 cursor-grab active:cursor-grabbing ${
                            isFocused ? 'border-white/10' : 'border-white/5'
                        }`}
                    >
                        <div className="flex items-center gap-2">
                            <Terminal size={14} className={isFocused ? 'text-zinc-300' : 'text-zinc-500'} />
                            <span className={`text-[10px] uppercase font-bold tracking-widest ${
                                isFocused ? 'text-zinc-400' : 'text-zinc-600'
                            }`}>System Logs</span>
                        </div>
                        
                        <button 
                            onClick={() => close()}
                            className="text-zinc-500 hover:text-white transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-hidden relative border-x border-b border-white/10 rounded-b-xl">
                        <SystemConsole />
                    </div>
                </div>
            )}
        </AceWindow>
    );
};
