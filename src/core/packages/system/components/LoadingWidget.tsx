import type { AceRegistryType } from '#/schemas/registryTypes';
import React from 'react';
import { Loader2 } from 'lucide-react';

export const registry: AceRegistryType.Component = {
    name: 'loading_widget',
    slug: 'loading-widget',
    react_behavior: 'system_loading_state',
};

export const LoadingWidget: React.FC = () => {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-black/80 border border-white/10 rounded-2xl p-6 shadow-2xl overflow-hidden">
            <div className="relative flex items-center justify-center">
                <div className="absolute w-24 h-24 bg-blue-500/20 rounded-full blur-2xl animate-pulse" />
                <div className="absolute w-16 h-16 border border-blue-500/30 rounded-full animate-ping" />
                <div className="relative bg-gradient-to-br from-blue-400 to-blue-600 p-4 rounded-xl shadow-lg shadow-blue-500/40">
                    <Loader2 size={32} className="text-white animate-spin" />
                </div>
            </div>

            <div className="mt-8 flex flex-col items-center gap-2">
                <h2 className="text-white font-bold tracking-widest uppercase text-[10px] opacity-80">
                    ACE System
                </h2>
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-zinc-400 font-mono italic">Initializing Core...</span>
                </div>
            </div>

            <div className="absolute bottom-0 left-0 w-full h-1 bg-zinc-900">
                <div className="h-full bg-blue-500 w-1/3 animate-[loading-bar_1.5s_infinite_ease-in-out]" />
            </div>

            <style aria-hidden="true">{`
                @keyframes loading-bar {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(300%); }
                }
            `}</style>
        </div>
    );
};

export default LoadingWidget;
