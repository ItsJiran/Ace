import { useState } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { AceWindow } from '#/components/layout/AceWindow';
import { Sparkles, Search, Command } from 'lucide-react';

export const registry: AceRegistryType.Window = {
    name: 'Prompt Morph Window',
    slug: 'prompt-morph-window',
    react_behavior: 'window_shell',
};

export default function PromptMorphWindow({ windowUid }: { windowUid: string }) {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <AceWindow windowUid={windowUid} headless>
            {({ isFocused }) => (
                <div
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                    className={`h-full w-full overflow-hidden bg-white rounded-full border transition-colors ${
                        (isFocused || isHovered)
                            ? 'border-white/90 bg-white/92 '
                            : 'border-white/50 bg-white/58 '
                    }`}
                >
                    <div className="relative flex h-full w-full items-center gap-3 px-4">
                        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/85 text-sky-600 ring-1 ring-sky-200/70">
                            <Sparkles size={16} />
                        </div>
                        <div className="relative min-w-0 flex-1 overflow-hidden">
                            <div className="truncate text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                                Prompt Surface
                            </div>
                            <div className="truncate text-sm text-slate-700">
                                Ask ACE anything, search tools, or route a task
                            </div>
                        </div>
                        <div className="relative flex items-center gap-2 text-slate-500">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/75 ring-1 ring-slate-200/70">
                                <Search size={14} />
                            </div>
                            <div className="hidden h-8 items-center gap-1 rounded-full bg-white/78 px-3 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200/70 sm:flex">
                                <Command size={12} />
                                K
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AceWindow>
    );
}
