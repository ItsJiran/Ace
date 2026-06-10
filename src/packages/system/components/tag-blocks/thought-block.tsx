/**
 * ThoughtBlock — renders <thought> JSON as standalone collapsible card.
 */

import React, { useState } from 'react';
import { Brain, ChevronDown, MessageSquareText, Wrench, Server, StopCircle, FileText, Terminal, Eye, Folder, ListChecks } from 'lucide-react';

export interface ThoughtBlockProps {
    text: string;
    done?: boolean;
    isLast?: boolean;
}

interface ThoughtData {
    observation: string;
    action_types: string;
    action_reason: string;
}

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    action_speak: MessageSquareText, action_tool: Wrench, action_memory: Brain,
    action_mcp: Server, action_write_file: FileText, action_shell: Terminal,
    action_read_file: Eye, action_list_directory: Folder, action_step: ListChecks, end: StopCircle,
};

const ACTION_COLORS: Record<string, string> = {
    action_speak: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
    action_tool: 'text-blue-400 bg-blue-500/10 border-blue-500/25',
    action_memory: 'text-purple-400 bg-purple-500/10 border-purple-500/25',
    action_mcp: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
    action_write_file: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/25',
    action_shell: 'text-rose-400 bg-rose-500/10 border-rose-500/25',
    action_read_file: 'text-sky-400 bg-sky-500/10 border-sky-500/25',
    action_list_directory: 'text-teal-400 bg-teal-500/10 border-teal-500/25',
    action_step: 'text-orange-400 bg-orange-500/10 border-orange-500/25',
    end: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/25',
};

function parseThoughtData(text: string): ThoughtData | null {
    try {
        const d = JSON.parse(text.trim());
        if (typeof d.observation === 'string') return d as ThoughtData;
    } catch {}
    return { observation: text, action_types: '', action_reason: '' };
}

export function ThoughtBlock({ text, done, isLast }: ThoughtBlockProps) {
    const data = parseThoughtData(text);
    if (!data) return null;
    const [open, setOpen] = useState(false);
    const actions = (data.action_types ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
    const reasons: Record<string, string> = {};
    for (const part of (data.action_reason ?? '').split('|').map((s: string) => s.trim()).filter(Boolean)) {
        const ci = part.indexOf(':');
        if (ci > 0) reasons[part.slice(0, ci).trim()] = part.slice(ci + 1).trim();
    }

    if (!open) {
        return (
            <button type="button" onClick={() => setOpen(true)}
                className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md hover:bg-zinc-800/30 transition-colors group">
                <Brain className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="text-xs text-zinc-400 truncate flex-1">
                    {data.observation.slice(0, 80)}{data.observation.length > 80 ? '…' : ''}
                </span>
                {actions.length > 0 && <span className="text-[10px] text-zinc-500 shrink-0">{actions.length}a</span>}
                <ChevronDown className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300 shrink-0" />
            </button>
        );
    }

    return (
        <div className="flex gap-2">
            <div className="flex flex-col items-center shrink-0">
                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-purple-500/10 shrink-0">
                    <Brain className="w-3 h-3 text-purple-400" />
                </div>
                {!isLast && <div className="w-px flex-1 min-h-[6px] bg-zinc-700/40" />}
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1 pb-2">
                <button type="button" onClick={() => setOpen(false)}
                    className="flex items-center gap-1 text-left hover:opacity-70 transition-opacity">
                    <span className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider">Thought</span>
                    <ChevronDown className="w-3 h-3 text-zinc-500" />
                </button>
                <div className="border-l border-zinc-700/40 pl-2 py-0.5 space-y-1.5">
                    <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">{data.observation}</p>
                    {actions.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {actions.map((a, i) => {
                                const Icon = ACTION_ICONS[a];
                                const colors = ACTION_COLORS[a] ?? 'text-zinc-400 bg-zinc-500/10 border-zinc-500/25';
                                const reason = reasons[a] || reasons[a.replace(/^action_/, '')];
                                return (
                                    <span key={`${a}-${i}`}
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${colors}`}
                                        title={reason}>
                                        {Icon && <Icon className="w-3 h-3" />}
                                        {a.replace(/^action_/, '')}
                                    </span>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

