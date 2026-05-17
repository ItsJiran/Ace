/* eslint-disable react-refresh/only-export-components */

import { motion } from 'framer-motion';
import type { AceRegistryType } from '#/schemas/registry-types';
import { CheckCircle2, CircleDashed, Sparkles } from 'lucide-react';

export const registry: AceRegistryType.Renderer = {
    name: 'Todo Renderer',
    slug: 'todo-renderer',
    description: 'Renders planner and todo items emitted from backend runtime events.',
    handler_mode: 'event_adapter',
    event_types: ['planning', 'todo'],
};

export const handler: AceRegistryType.RendererHandler = ({ payload, status }) => {
    if (!payload || typeof payload !== 'object') {
        return { props: { status, todo_items: [] } };
    }

    return {
        props: {
            ...(payload as Record<string, unknown>),
            status,
        },
    };
};

interface TodoRendererItem {
    title?: string;
    detail?: string;
    step_index?: number;
    is_complete?: boolean;
}

interface TodoRendererProps {
    title?: string;
    status?: string;
    todo_items?: TodoRendererItem[];
}

export default function TodoRenderer({ todo_items = [] }: TodoRendererProps) {
    const currentIndex = todo_items.findIndex((item) => item.is_complete !== true);
    const activeIndex = currentIndex >= 0 ? currentIndex : Math.max(todo_items.length - 1, 0);

    return (
        <div className="system-chat-renderer-surface">
            {/* <div className="border-b border-zinc-800/80 px-3 py-3">
                <div className="flex items-start gap-2">
                    <span className={`mt-0.5 ${statusTone}`}><ListTodo size={14} /></span>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="text-[12px] font-medium text-zinc-100">{title}</span>
                            <span className={`rounded bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${statusTone}`}>
                                {status}
                            </span>
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-400">{completedCount}/{todo_items.length} complete</div>
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.div
                                key={activeKey}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.24, ease: 'easeOut' }}
                                className="mt-2 text-[11px] text-zinc-300"
                            >
                                {activeItem
                                    ? `${activeItem.is_complete === true ? 'Completed' : 'Current'}: ${activeItem.title ?? `Step ${activeIndex + 1}`}${activeItem.detail ? ` - ${activeItem.detail}` : ''}`
                                    : 'Plan tersedia, belum ada step aktif.'}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>
            </div> */}

            <div className="space-y-2 px-3 py-3">
                {todo_items.length === 0 ? (
                    <div className="system-chat-renderer-panel system-chat-inline-empty px-3 py-3 not-italic">
                        No todo items emitted yet.
                    </div>
                ) : todo_items.map((item, index) => {
                    const isComplete = item.is_complete === true;
                    const isCurrent = index === activeIndex && !isComplete;
                    const isFuture = index > activeIndex && !isComplete;
                    const stateKey = isComplete ? 'done' : isCurrent ? 'current' : 'next';

                    return (
                        <motion.div
                            key={`${item.step_index ?? index}:${item.title ?? 'todo'}`}
                            layout
                            initial={{ opacity: 0, y: 18, scale: 0.98 }}
                            animate={{
                                opacity: 1,
                                y: isComplete ? -2 : isCurrent ? 0 : 8,
                                scale: isCurrent ? 1.01 : 1,
                            }}
                            transition={{ duration: 0.28, ease: 'easeOut', delay: index * 0.05 }}
                            className={[
                                'system-chat-todo-item',
                                isCurrent ? 'is-current' : '',
                                isComplete ? 'is-complete' : '',
                            ].filter(Boolean).join(' ')}
                        >
                            {index < todo_items.length - 1 ? (
                                <motion.div
                                    initial={false}
                                    animate={{ backgroundColor: index < activeIndex ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.1)' }}
                                    transition={{ duration: 0.28, ease: 'easeOut' }}
                                    className="system-chat-todo-rail"
                                />
                            ) : null}

                            <div className="flex items-start gap-3">
                                <motion.div
                                    layout
                                    initial={false}
                                    animate={{
                                        scale: isCurrent ? 1.06 : 1,
                                        y: isComplete ? -1 : 0,
                                    }}
                                    transition={{ duration: 0.24, ease: 'easeOut' }}
                                    className={[
                                        'system-chat-todo-node',
                                        isCurrent ? 'is-current' : '',
                                        isComplete ? 'is-complete' : '',
                                    ].filter(Boolean).join(' ')}
                                >
                                    <motion.div
                                        key={stateKey}
                                        initial={{ opacity: 0, y: 8, scale: 0.9 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: -8, scale: 0.92 }}
                                        transition={{ duration: 0.22, ease: 'easeOut' }}
                                    >
                                        {isComplete
                                            ? <CheckCircle2 size={15} className="system-chat-tone-success" />
                                            : isCurrent
                                                ? <Sparkles size={15} className="system-chat-tone-info" />
                                                : <CircleDashed size={15} className={isFuture ? 'system-chat-icon-muted' : 'system-chat-tone-info'} />
                                        }
                                    </motion.div>
                                </motion.div>

                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <div className="system-chat-label-muted text-[10px] tracking-[0.2em]">
                                            Step {index + 1}
                                        </div>
                                        <motion.span
                                            key={`${stateKey}-badge`}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -8 }}
                                            transition={{ duration: 0.2, ease: 'easeOut' }}
                                            className={[
                                                'system-chat-tone-pill',
                                                isComplete
                                                    ? 'system-chat-tone-success'
                                                    : isCurrent
                                                        ? 'system-chat-tone-info'
                                                        : 'system-chat-icon-muted',
                                            ].join(' ')}
                                        >
                                            {isComplete ? 'Done' : isCurrent ? 'Current' : 'Next'}
                                        </motion.span>
                                    </div>

                                    <motion.div
                                        layout
                                        initial={false}
                                        animate={{ opacity: isFuture ? 0.78 : 1, y: isComplete ? -1 : 0 }}
                                        transition={{ duration: 0.24, ease: 'easeOut' }}
                                        className="system-chat-todo-title"
                                    >
                                        {item.title ?? `Step ${index + 1}`}
                                    </motion.div>

                                    {item.detail ? (
                                        <motion.div
                                            layout
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.24, ease: 'easeOut', delay: 0.04 + index * 0.05 }}
                                            className="system-chat-todo-detail"
                                        >
                                            {item.detail}
                                        </motion.div>
                                    ) : null}
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
