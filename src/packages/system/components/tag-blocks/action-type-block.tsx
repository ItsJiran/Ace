/**
 * ActionTypeBlock — renders <action_type> as a chain panel.
 *
 * Color per action:
 *   action_speak  → emerald
 *   action_tool   → blue
 *   action_context → purple
 *   action_mcp    → amber
 *   end           → zinc
 */
import React from 'react';
import { MessageSquareText, Wrench, Search, Server, StopCircle } from 'lucide-react';
import { ChainBlock, type ChainBlockProps } from './chain-block';

export type ActionTypeBlockProps = Omit<ChainBlockProps, 'icon' | 'label' | 'accentClass'>;

const STYLE: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; accent: string }> = {
    action_speak:  { icon: MessageSquareText, label: 'Action → Speak',  accent: 'text-emerald-400 border-emerald-500/40' },
    action_tool:   { icon: Wrench,           label: 'Action → Tool',   accent: 'text-blue-400 border-blue-500/40' },
    action_context:{ icon: Search,           label: 'Action → Context',accent: 'text-purple-400 border-purple-500/40' },
    action_mcp:    { icon: Server,           label: 'Action → MCP',    accent: 'text-amber-400 border-amber-500/40' },
    end:           { icon: StopCircle,       label: 'Action → End',    accent: 'text-zinc-400 border-zinc-500/40' },
};

const FALLBACK = { icon: StopCircle, label: 'Action', accent: 'text-zinc-400 border-zinc-500/40' };

export function ActionTypeBlock({ text, done, isLast }: ActionTypeBlockProps) {
    const action = text.trim();
    const style = STYLE[action] ?? FALLBACK;
    const Icon = style.icon;

    return (
        <ChainBlock
            icon={<Icon className="w-3 h-3" />}
            label={style.label}
            accentClass={style.accent}
            text={action}
            done={done}
            isLast={isLast}
        />
    );
}

