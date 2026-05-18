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
    accentClassName = 'system-chat-icon-muted',
    children,
}: RendererDisclosureCardProps) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <div className="system-chat-renderer-surface">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="system-chat-renderer-header"
            >
                <div className="flex min-w-0 items-center gap-2">
                    <span className={`flex-shrink-0 ${accentClassName}`}>{icon}</span>
                    <div className="min-w-0">
                        <div className="system-chat-renderer-heading truncate text-[10px] tracking-widest">
                            {title}
                        </div>
                        {summary ? (
                            <div className="system-chat-renderer-summary">
                                {summary}
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className="flex items-center gap-2 pl-2">
                    {status ? (
                        <span className="system-chat-renderer-status">
                            {status}
                        </span>
                    ) : null}
                    <span className="system-chat-icon-muted">
                        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                </div>
            </button>

            {open ? (
                <div className="system-chat-renderer-body">
                    {children}
                </div>
            ) : null}
        </div>
    );
}
