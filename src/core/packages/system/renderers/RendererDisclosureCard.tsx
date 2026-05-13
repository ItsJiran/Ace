import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface RendererDisclosureCardProps {
    icon: ReactNode;
    title: string;
    summary?: ReactNode;
    status?: string;
    defaultOpen?: boolean;
    accentClassName?: string;
    children: ReactNode;
}

export default function RendererDisclosureCard({
    icon,
    title,
    summary,
    status,
    defaultOpen = false,
    accentClassName = 'text-zinc-400',
    children,
}: RendererDisclosureCardProps) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className="overflow-hidden rounded-lg border border-zinc-200/80 bg-white/80 backdrop-blur-sm dark:border-white/10 dark:bg-zinc-950/45">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="flex w-full items-center justify-between gap-3 border-b border-zinc-200/80 bg-zinc-900 px-3 py-2 text-left dark:border-white/10 dark:bg-white/5"
            >
                <div className="flex min-w-0 items-center gap-2">
                    <span className={`flex-shrink-0 ${accentClassName}`}>{icon}</span>
                    <div className="min-w-0">
                        <div className="truncate text-[10px] font-bold uppercase tracking-widest text-zinc-300">
                            {title}
                        </div>
                        {summary ? (
                            <div className="mt-0.5 truncate text-[11px] text-zinc-500">
                                {summary}
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className="flex items-center gap-2 pl-2">
                    {status ? (
                        <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                            {status}
                        </span>
                    ) : null}
                    <span className="text-zinc-500">
                        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                </div>
            </button>

            {open ? (
                <div className="px-3 py-3">
                    {children}
                </div>
            ) : null}
        </div>
    );
}
