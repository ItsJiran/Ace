/* eslint-disable react-refresh/only-export-components */

import type { AceRegistryType } from '#/schemas/registryTypes';
import { CheckCircle2, CircleDashed, ListTodo } from 'lucide-react';
import RendererDisclosureCard from './RendererDisclosureCard';

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

export default function TodoRenderer({ title = 'Plan', status = 'loading', todo_items = [] }: TodoRendererProps) {
    const completedCount = todo_items.filter((item) => item.is_complete === true).length;

    return (
        <RendererDisclosureCard
            icon={<ListTodo size={14} />}
            title={title}
            summary={<span>{completedCount}/{todo_items.length} complete</span>}
            status={status}
            accentClassName="text-violet-400"
        >
            <div className="space-y-2">
                {todo_items.length === 0 ? (
                    <div className="rounded bg-zinc-950/80 px-2 py-2 text-xs text-zinc-400">
                        No todo items emitted yet.
                    </div>
                ) : todo_items.map((item, index) => {
                    const isComplete = item.is_complete === true;
                    return (
                        <div key={`${item.step_index ?? index}:${item.title ?? 'todo'}`} className="rounded border border-zinc-200/80 bg-white/80 px-2 py-2 dark:border-white/10 dark:bg-white/5">
                            <div className="flex items-start gap-2">
                                {isComplete
                                    ? <CheckCircle2 size={14} className="mt-0.5 text-emerald-600 dark:text-emerald-300" />
                                    : <CircleDashed size={14} className="mt-0.5 text-violet-600 dark:text-violet-300" />
                                }
                                <div className="min-w-0 flex-1">
                                    <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{item.title ?? `Step ${index + 1}`}</div>
                                    {item.detail ? <div className="mt-1 text-[11px] leading-5 text-zinc-600 dark:text-zinc-300">{item.detail}</div> : null}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </RendererDisclosureCard>
    );
}
