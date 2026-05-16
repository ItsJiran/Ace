import { GripHorizontal, MessageCircleMore, Minus, Sparkles, X } from 'lucide-react';

import type { AceWindowRenderProps } from '#/hooks/useAceWindow';

import SystemAIChatMessages from './SystemAIChatMessages';

type SystemAIChatConversationContainerProps = {
    title?: string;
    selectedSdk: string;
    resolvedModel: string;
    sessionUid?: string;
    sessionStatus: string;
    dragHandleProps: AceWindowRenderProps['dragHandleProps'];
    isFocused: boolean;
    isDragging: boolean;
    onClose: () => void;
    onMinimize: () => void;
};

export default function SystemAIChatConversationContainer({
    title,
    selectedSdk,
    resolvedModel,
    sessionUid,
    sessionStatus,
    dragHandleProps,
    isFocused,
    isDragging,
    onClose,
    onMinimize,
}: SystemAIChatConversationContainerProps) {
    return (
        <section
            className={[
                'system-shell-primary flex h-full w-full flex-col overflow-hidden rounded-[24px]',
                isDragging ? 'dragging focused' : '',
                !isDragging && isFocused ? 'focused' : '',
            ].filter(Boolean).join(' ')}
        >
            
            <div className="flex cursor-grab items-start justify-between gap-4 border-b border-white/10 px-5 py-4 active:cursor-grabbing" {...dragHandleProps}>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-300">
                            <GripHorizontal size={14} />
                        </span>
                        <Sparkles size={12} />
                        System Chat Runtime
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-medium tracking-tight text-white">{title || 'ACE Chat'}</h2>
                        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-zinc-300">{selectedSdk}</span>
                        <span className="inline-flex max-w-[220px] items-center truncate rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-zinc-300">{resolvedModel || 'no model selected'}</span>
                    </div>

                    <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
                        Prompt composer and conversation stream live together inside one window.
                    </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                    <div className="flex items-center gap-2 self-end">
                        <button
                            type="button"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={onMinimize}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/10 px-0 py-0 text-sm font-medium text-zinc-200"
                            aria-label="Minimize ACE Chat"
                        >
                            <Minus size={16} />
                        </button>

                        <button
                            type="button"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={onClose}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/10 px-0 py-0 text-sm font-medium text-zinc-200"
                            aria-label="Close ACE Chat"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <span className="text-[10px] text-zinc-500" title={sessionUid || ''}>
                        session: {sessionUid || '-'}
                    </span>
                    <span className="text-[10px] text-zinc-500">state: {sessionStatus}</span>
                </div>
            </div>

            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
                <div>
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-500">Conversation</div>
                    <div className="mt-1 text-sm text-zinc-300">Assistant turns, plans, tools, and runtime activity</div>
                </div>
                <MessageCircleMore size={16} className="text-zinc-500" />
            </div>

            <div className="h-full overflow-auto px-5 pb-5 pt-4 [scrollbar-color:rgb(82_82_91_/_0.85)_transparent] [scrollbar-width:thin]">
                <SystemAIChatMessages sessionUid={sessionUid} className="text-zinc-100" />
            </div>
        </section>
    );
}