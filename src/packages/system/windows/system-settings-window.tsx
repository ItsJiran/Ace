import type { AceRegistryType } from '#/schemas/registry-types';
import { AceWindow } from '#/components/layout/ace-window';
import { X, Minus, GripHorizontal } from 'lucide-react';
import SystemSettings from '../components/system-settings';
import type { WindowConfig } from '#/schemas/window';
import type { AceWindowRenderProps } from '#/hooks/use-ace-window';

// eslint-disable-next-line react-refresh/only-export-components
export const registry: AceRegistryType.Window = {
    name: 'System Settings Window',
    slug: 'system-settings-window',
    icon_slug: 'settings-2',
    react_behavior: 'window_shell',
};

type WindowShellProps = {
    config: WindowConfig;
    isDragging: boolean;
    isFocused: boolean;
    close: () => void;
    minimize: () => void;
    dragHandleProps: AceWindowRenderProps['dragHandleProps'];
};

function SystemSettingsShell({
    config,
    isDragging,
    isFocused,
    close,
    minimize,
    dragHandleProps,
}: WindowShellProps) {
    return (
        <div
            className={[
                'flex h-full w-full flex-col overflow-hidden pointer-events-auto rounded-[20px]',
                'bg-[#F0F2F7] border border-[#E3E7F0]',
                'dark:bg-[#0F121A] dark:border-[#2A3142]',
                'transition-[opacity,transform,box-shadow] ease-out',
                isDragging ? 'duration-0' : 'duration-200',
                isFocused ? 'ring-1 ring-blue-500/20 dark:ring-blue-500/30' : '',
            ].filter(Boolean).join(' ')}
            style={{ contain: 'layout paint style' }}
        >
            <div
                className={[
                    'h-12 shrink-0 select-none border-b px-5 flex items-center justify-between',
                    'border-[#E3E7F0] bg-white/50 cursor-grab active:cursor-grabbing group',
                    'dark:border-[#2A3142] dark:bg-[#171C27]/50',
                    isDragging ? '' : 'hover:bg-white/80 dark:hover:bg-[#171C27]/80',
                ].join(' ')}
                {...dragHandleProps}
                style={{ willChange: isDragging ? 'auto' : 'background-color' }}
            >
                <div className="flex items-center gap-3">
                    <div className="rounded-md bg-blue-100 p-1.5 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                        <GripHorizontal size={14} />
                    </div>
                    <span className="text-sm font-medium text-[#171A23] dark:text-[#E9EDF7]">
                        {config.title || 'System Settings'}
                    </span>
                </div>
                <div
                    className={[
                        'flex items-center gap-2',
                        isDragging ? 'opacity-0' : 'opacity-0 group-hover:opacity-100',
                    ].join(' ')}
                    style={{ transitionDuration: isDragging ? '0ms' : '200ms' }}
                >
                    <button
                        onClick={minimize}
                        className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                        title="Minimize"
                    >
                        <Minus size={16} />
                    </button>
                    <button
                        onClick={close}
                        className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-red-100 dark:hover:bg-red-900/30"
                        title="Close"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            <div className="relative flex-1 overflow-hidden bg-white dark:bg-[#171C27]">
                <SystemSettings />
            </div>
        </div>
    );
}

export default function SystemSettingsWindow({ windowUid }: { windowUid: string }) {
    return (
        <AceWindow windowUid={windowUid} headless>
            {({ windowConfig, dragHandleProps, isDragging, isFocused, close, minimize }) => {
                if (!windowConfig) return null;
                return (
                    <SystemSettingsShell
                        config={windowConfig}
                        isDragging={isDragging}
                        isFocused={isFocused}
                        close={close}
                        minimize={minimize}
                        dragHandleProps={dragHandleProps}
                    />
                );
            }}
        </AceWindow>
    );
}
