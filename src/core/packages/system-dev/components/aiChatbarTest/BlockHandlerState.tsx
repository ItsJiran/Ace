import { useMemo } from 'react';
import type { ParserBatchMemory } from './types';

interface BlockHandlerStateProps {
    responseMemory: ParserBatchMemory | undefined;
}

export function BlockHandlerState({ responseMemory }: BlockHandlerStateProps) {
    const runtimeEvents = useMemo(() => {
        const items = responseMemory?.parser_handler_results || [];
        return items.filter((item) => {
            if (!item.event_name) return false;
            return item.event_name === 'parser_handler_dispatch'
                || item.event_name === 'parser_handler_started'
                || item.event_name === 'parser_handler_result'
                || item.event_name === 'parser_handler_error'
                || item.event_name === 'tool_action_dispatch'
                || item.event_name === 'tool_action_started'
                || item.event_name === 'tool_action_result'
                || item.event_name === 'tool_action_error';
        });
    }, [responseMemory?.parser_handler_results]);

    const activeActionBlocks = useMemo(() => {
        const blocks = responseMemory?.blocks || [];
        return blocks.filter((block) => {
            if (block.type !== 'tool' && block.type !== 'storage') return false;
            return block.status === 'pending' || block.status === 'queued' || block.status === 'running';
        });
    }, [responseMemory?.blocks]);

    const handlerRunningLabel = useMemo(() => {
        const latest = runtimeEvents.length > 0 ? runtimeEvents[runtimeEvents.length - 1] : undefined;
        if (!latest?.event_name) return 'idle';
        if (
            latest.event_name === 'parser_handler_dispatch'
            || latest.event_name === 'parser_handler_started'
            || latest.event_name === 'tool_action_dispatch'
            || latest.event_name === 'tool_action_started'
        ) {
            const action = typeof latest.payload?.action === 'string' ? latest.payload.action : 'unknown';
            return `running (${action})`;
        }
        return 'idle';
    }, [runtimeEvents]);

    return (
        <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3 mb-3">
            <div className="text-xs text-zinc-500 mb-2">Block Handler State</div>
            <div className="text-[11px] text-zinc-300">
                handler: <span className={handlerRunningLabel.startsWith('running') ? 'text-amber-300' : 'text-zinc-300'}>{handlerRunningLabel}</span>
                {' | '}active blocks: <span className="text-zinc-200">{activeActionBlocks.length}</span>
                {' | '}runtime events: <span className="text-zinc-200">{runtimeEvents.length}</span>
            </div>
            {activeActionBlocks.length > 0 && (
                <div className="mt-2 space-y-1">
                    {activeActionBlocks.map((block, idx) => (
                        <div key={idx} className="text-[10px] text-zinc-400 border border-zinc-800 rounded px-2 py-1 bg-black/20 font-mono">
                            {block.type} | action: {'action' in block ? block.action || '-' : '-'} | status: {'status' in block ? block.status : '-'}
                        </div>
                    ))}
                </div>
            )}
            {runtimeEvents.length > 0 && (
                <div className="mt-2 max-h-36 overflow-auto space-y-1">
                    {runtimeEvents.slice(-8).map((event, idx) => (
                        <div key={`${event.at}-${idx}`} className="text-[10px] text-zinc-400 border border-zinc-800 rounded px-2 py-1 bg-black/20">
                            <span className="text-zinc-300">{event.event_name}</span>
                            <span className="text-zinc-600"> @ {new Date(event.at).toLocaleTimeString()}</span>
                            {typeof event.payload?.action === 'string' ? <span className="text-zinc-500"> | {event.payload.action}</span> : null}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
