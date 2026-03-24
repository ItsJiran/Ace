import type { AceRegistryType } from '#/schemas/registryTypes';
import { Settings, Box, Bell, Terminal, Command } from 'lucide-react';
import { useAceWindow } from '#/hooks/useAceWindow';

export const registry: AceRegistryType.Component = {
    name: 'dock_bar',    slug: 'dock-bar',    react_behavior: 'dock_bar_ui',
};

export const DockBar = ({ windowUid }: { windowUid: string }) => {
    // Component consumes hook directly because it is a custom borderless shell deeply integrated with drag
    const { dragHandleProps, isDragging } = useAceWindow(windowUid);

    const items = [
        { id: 'launcher', icon: <Command size={18} />, label: 'Launcher' },
        { id: 'tools', icon: <Box size={18} />, label: 'Tools' },
        { id: 'terminal', icon: <Terminal size={18} />, label: 'Console' },
        { id: 'notifications', icon: <Bell size={18} />, label: 'Alerts' },
        { id: 'settings', icon: <Settings size={18} />, label: 'Settings' },
    ];

    return (
        <div className="flex h-full w-full items-center justify-center p-2">
            <div 
                {...dragHandleProps}
                className={`flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900/60 p-2 shadow-2xl transition-all hover:bg-zinc-900/80 hover:scale-[1.01] cursor-grab active:cursor-grabbing`}
            >
                {items.map((item) => (
                    <button
                        key={item.id}
                        className="group relative flex h-10 w-10 items-center justify-center rounded-full text-zinc-400 hover:bg-white/10 hover:text-white transition-all active:scale-95 hover:shadow-lg hover:shadow-blue-500/10"
                        title={item.label}
                    >
                        {item.icon}
                        
                        {/* Hover Glow */}
                        <div className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-white/5" />
                    </button>
                ))}
            </div>
        </div>
    );
};

export default DockBar;
