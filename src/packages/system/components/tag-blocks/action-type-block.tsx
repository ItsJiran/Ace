/**
 * ActionTypeBlock — renders <action_types> as a chain panel with badge pills.
 *
 * Each action in the comma-separated list gets its own color-coded pill badge.
 */

import React from 'react';
import { MessageSquareText, Wrench, Brain, Server, StopCircle, FileText, Terminal, Eye, ListChecks } from 'lucide-react';

export interface ActionTypeBlockProps {
    text: string;
    done?: boolean;
    isLast?: boolean;
}

const ACTION_META: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; fg: string; bg: string }> = {
    action_speak:      { icon: MessageSquareText, label: 'Speak',  fg: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    action_tool:       { icon: Wrench,            label: 'Tool',   fg: 'text-blue-400',    bg: 'bg-blue-500/10' },
    action_memory:     { icon: Brain,             label: 'Memory', fg: 'text-purple-400',  bg: 'bg-purple-500/10' },
    action_mcp:        { icon: Server,            label: 'MCP',    fg: 'text-amber-400',   bg: 'bg-amber-500/10' },
    action_write_file: { icon: FileText,          label: 'Write',  fg: 'text-cyan-400',    bg: 'bg-cyan-500/10' },
    action_shell:      { icon: Terminal,          label: 'Shell',  fg: 'text-rose-400',    bg: 'bg-rose-500/10' },
    action_read_file:  { icon: Eye,               label: 'Read',   fg: 'text-sky-400',     bg: 'bg-sky-500/10' },
    action_step:       { icon: ListChecks,        label: 'Plan',   fg: 'text-orange-400',  bg: 'bg-orange-500/10' },
    end:               { icon: StopCircle,        label: 'End',    fg: 'text-zinc-400',    bg: 'bg-zinc-500/10' },
};

const FALLBACK = { icon: StopCircle, label: 'Action', fg: 'text-zinc-400', bg: 'bg-zinc-500/10' };

export function ActionTypeBlock({ text, done, isLast }: ActionTypeBlockProps) {
    const actions = text
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

    if (!text || actions.length === 0) return null;

    return (
        <div className="flex gap-2">
            {/* Left rail — icon + connector line */}
            <div className="flex flex-col items-center shrink-0">
                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-700/30 shrink-0">
                    <ListChecks className="w-3 h-3 text-zinc-400" />
                </div>
                {!isLast && <div className="w-px flex-1 min-h-[6px] bg-zinc-700/40" />}
            </div>

            {/* Content */}
            <div className="flex flex-col gap-0.5 min-w-0 flex-1 pb-2">
                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                    Actions
                </span>
                <div className="border-l border-zinc-700/40 pl-2 py-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        {actions.map((action, i) => {
                            const meta = ACTION_META[action] ?? FALLBACK;
                            const Icon = meta.icon;
                            return (
                                <span
                                    key={`${action}-${i}`}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-current/25 ${meta.fg} ${meta.bg}`}
                                >
                                    <Icon className="w-3 h-3" />
                                    {meta.label}
                                </span>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}

