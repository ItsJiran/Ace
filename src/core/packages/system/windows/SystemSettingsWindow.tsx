import type { AceRegistryType } from '#/schemas/registryTypes';
import { AceWindow } from '#/components/layout/AceWindow';
import { X, Minus, GripHorizontal } from 'lucide-react';
import SystemSettings from '../components/SystemSettings';

export const registry: AceRegistryType.Window = {
    name: 'System Settings Window',
    slug: 'system-settings-window',
    react_behavior: 'window_shell',
};

export default function SystemSettingsWindow({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid} headless>
            {({ config, dragHandleProps, isDragging, isMounted, isFocused, close }) => {
                if (!config) return null;
                
                return (
                    <div
                        className={`
                            flex flex-col w-full h-full overflow-hidden pointer-events-auto
                            rounded-[20px] shadow-2xl
                            bg-[#F0F2F7] dark:bg-[#0F121A]
                            border border-[#E3E7F0] dark:border-[#2A3142]
                            transition-all ease-out
                            ${isDragging ? 'duration-0' : 'duration-200'}
                            ${isMounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}
                            ${isFocused ? 'ring-1 ring-blue-500/20 dark:ring-blue-500/30' : ''}
                        `}
                    >
                        {/* Custom Header */}
                        <div
                            className={`h-12 flex items-center justify-between px-5 select-none shrink-0 border-b border-[#E3E7F0] dark:border-[#2A3142] bg-white/50 dark:bg-[#171C27]/50 cursor-grab active:cursor-grabbing group transition-colors hover:bg-white/80 dark:hover:bg-[#171C27]/80`}
                            onMouseDown={dragHandleProps.onMouseDown}
                        >
                            <div className="flex items-center gap-3">
                                <div className="p-1.5 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                    <GripHorizontal size={14} />
                                </div>
                                <span className="font-medium text-sm text-[#171A23] dark:text-[#E9EDF7]">
                                    {config.title || 'System Settings'}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                <button 
                                    className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 transition-colors"
                                    title="Minimize"
                                >
                                    <Minus size={16} />
                                </button>
                                <button 
                                    onClick={close}
                                    className="p-1.5 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500 transition-colors"
                                    title="Close"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 relative overflow-hidden bg-white dark:bg-[#171C27]">
                            <SystemSettings />
                        </div>
                    </div>
                );
            }}
        </AceWindow>
    );
}
