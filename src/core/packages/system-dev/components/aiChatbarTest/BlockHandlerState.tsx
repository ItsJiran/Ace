import { useMemo } from 'react';
import {
    PARSER_BLOCK_STATUS_EVENT_NAMES,
    PARSER_COMPLETED_EVENT_NAMES,
    PARSER_FAILED_EVENT_NAMES,
    PARSER_RUNNING_EVENT_NAMES,
    PARSER_RUNTIME_EVENT,
    isParserRuntimeEventName,
} from '#/schemas/parserEventNames';
import type { ParserBatchMemory } from './types';

interface BlockHandlerStateProps {
    responseMemory: ParserBatchMemory | undefined;
}

interface ActiveHandlerEntry {
    blockId: number;
    parserRef: string;
    parsedTag: string;
    status: 'running' | 'completed' | 'failed';
    action?: string;
    at: number;
}

function toNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toStringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function isRunningEvent(eventName: string): boolean {
    return PARSER_RUNNING_EVENT_NAMES.includes(eventName as typeof PARSER_RUNNING_EVENT_NAMES[number]);
}

function isCompletedEvent(eventName: string): boolean {
    return PARSER_COMPLETED_EVENT_NAMES.includes(eventName as typeof PARSER_COMPLETED_EVENT_NAMES[number]);
}

function isFailedEvent(eventName: string): boolean {
    return PARSER_FAILED_EVENT_NAMES.includes(eventName as typeof PARSER_FAILED_EVENT_NAMES[number]);
}

function toParserNamespace(parserRef: string): string {
    return parserRef.replace(':parsers:', ':');
}

export function BlockHandlerState({ responseMemory }: BlockHandlerStateProps) {
    const runtimeEvents = useMemo(() => {
        const items = responseMemory?.parser_handler_results || [];
        return items.filter((item) => {
            if (!isParserRuntimeEventName(item.event_name)) return false;
            return PARSER_BLOCK_STATUS_EVENT_NAMES.includes(item.event_name);
        });
    }, [responseMemory?.parser_handler_results]);

    const activeHandlers = useMemo(() => {
        const records = [...runtimeEvents].sort((a, b) => a.at - b.at);
        const byBlockId = new Map<number, ActiveHandlerEntry>();

        for (const record of records) {
            const payload = record.payload && typeof record.payload === 'object' ? record.payload : {};
            const eventName = typeof record.event_name === 'string' ? record.event_name : '';
            const blockId = toNumber((payload as Record<string, unknown>).block_id);

            if (eventName === PARSER_RUNTIME_EVENT.BLOCK_REGISTRY_FOUND && blockId !== undefined) {
                const parserRef = toStringValue((payload as Record<string, unknown>).parser_ref) || 'unknown:parsers:unknown';
                const parsedTag = toStringValue((payload as Record<string, unknown>).parsed_tag) || 'unknown';
                const action = toStringValue((payload as Record<string, unknown>).action);

                byBlockId.set(blockId, {
                    blockId,
                    parserRef,
                    parsedTag,
                    status: 'completed',
                    action,
                    at: record.at,
                });
                continue;
            }

            if (blockId === undefined) continue;

            const existing = byBlockId.get(blockId);
            if (!existing) continue;

            const action = toStringValue((payload as Record<string, unknown>).action);
            if (action) existing.action = action;
            existing.at = record.at;

            if (isRunningEvent(eventName)) {
                existing.status = 'running';
            } else if (isFailedEvent(eventName)) {
                existing.status = 'failed';
            } else if (isCompletedEvent(eventName)) {
                existing.status = 'completed';
            }
        }

        return Array.from(byBlockId.values())
            .filter((entry) => entry.status === 'running')
            .sort((a, b) => b.at - a.at);
    }, [runtimeEvents]);

    const handlerRunningLabel = useMemo(() => {
        const latest = runtimeEvents.length > 0 ? runtimeEvents[runtimeEvents.length - 1] : undefined;
        if (!latest?.event_name) return 'idle';
        if (
            isRunningEvent(latest.event_name)
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
                {' | '}active handlers: <span className="text-zinc-200">{activeHandlers.length}</span>
                {' | '}runtime events: <span className="text-zinc-200">{runtimeEvents.length}</span>
            </div>
            {activeHandlers.length > 0 && (
                <div className="mt-2 space-y-1">
                    {activeHandlers.map((entry) => (
                        <div key={entry.blockId} className="text-[10px] text-zinc-400 border border-zinc-800 rounded px-2 py-1 bg-black/20 font-mono">
                            {toParserNamespace(entry.parserRef)} / {entry.parsedTag} | action: {entry.action || '-'} | status: {entry.status}
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
