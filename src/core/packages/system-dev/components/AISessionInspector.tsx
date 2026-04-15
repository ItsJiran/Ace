import { useEffect, useState } from 'react';
import type { AISession, AITurn, AIEntry, AIBlock, AIContextEntry, AIHistoryEntry, AIWorkingMemoryEntry } from '#/schemas/ai';
import { KernelEngine } from '#/services/kernelEngine';

// ============================================================
// Helpers
// ============================================================

function ts(ms: number) {
    return new Date(ms).toLocaleTimeString();
}

function badge(label: string, color: string) {
    return (
        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${color}`}>
            {label}
        </span>
    );
}

const statusColor: Record<string, string> = {
    streaming: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
    completed: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    success: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    error: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
    failed: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
    interrupted: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
    idle: 'bg-zinc-700/40 text-zinc-400 border border-zinc-600/30',
    active: 'bg-sky-500/20 text-sky-300 border border-sky-500/30',
    inactive: 'bg-zinc-700/40 text-zinc-500 border border-zinc-600/30',
} as const;

function StatusBadge({ status }: { status: string }) {
    const cls = statusColor[status] ?? 'bg-zinc-700/40 text-zinc-400';
    return badge(status, cls);
}

// ============================================================
// Sub-components
// ============================================================

function BlockRow({ block, idx }: { block: AIBlock; idx: number }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="border border-zinc-700/50 rounded mb-1 overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center gap-2 px-2 py-1 bg-zinc-800/60 hover:bg-zinc-700/40 text-left"
            >
                <span className="text-zinc-500">{open ? '▾' : '▸'}</span>
                <span className="text-purple-300 font-semibold">Block [{idx}]</span>
                <span className="text-zinc-400">&lt;{block.block_slug}&gt;</span>
                {block.package_ref && <span className="text-zinc-600 text-[10px]">{block.package_ref}</span>}
                <span className="ml-auto text-zinc-600 text-[10px]">
                    t{block.turn_index} · e{block.entry_index} · b{block.block_index}
                </span>
            </button>
            {open && (
                <div className="px-3 py-2 bg-zinc-900/60 space-y-1">
                    <div className="flex gap-2 text-[10px]">
                        <span className="text-zinc-500">session:</span>
                        <span className="text-zinc-300 font-mono">{block.session_uid}</span>
                    </div>
                    <div className="flex gap-2 text-[10px]">
                        <span className="text-zinc-500">process:</span>
                        <span className="text-zinc-300 font-mono">{block.process_uid}</span>
                    </div>
                    <div className="mt-1 text-[10px] text-zinc-400">Payload:</div>
                    <pre className="text-[10px] text-zinc-300 bg-zinc-950 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                        {JSON.stringify(block.payload, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}

function EntryRow({ entry, idx, isActive }: { entry: AIEntry; idx: number; isActive: boolean }) {
    const [open, setOpen] = useState(false);
    return (
        <div className={`border rounded mb-2 overflow-hidden ${isActive ? 'border-amber-500/40' : 'border-zinc-700/40'}`}>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center gap-2 px-2 py-1.5 bg-zinc-800/50 hover:bg-zinc-700/40 text-left"
            >
                <span className="text-zinc-500">{open ? '▾' : '▸'}</span>
                <span className="text-cyan-300 font-semibold">Entry [{idx}]</span>
                <StatusBadge status={entry.status} />
                {isActive && badge('ACTIVE', 'bg-amber-500/20 text-amber-300 border border-amber-500/30')}
                <span className="ml-auto text-zinc-600 text-[10px]">
                    {entry.blocks?.length ?? 0} block{(entry.blocks?.length ?? 0) !== 1 ? 's' : ''}
                    {' · '}attempt {entry.active_interaction_loop_attempt ?? 0}
                </span>
            </button>

            {open && (
                <div className="px-3 py-2 space-y-3 bg-zinc-900/40">

                    {/* Prompt */}
                    <div>
                        <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wide">Original Prompt</div>
                        <pre className="text-[10px] text-zinc-300 bg-zinc-950 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-32">
                            {entry.prompt || <span className="text-zinc-600 italic">empty</span>}
                        </pre>
                    </div>

                    {/* Composed Prompt */}
                    <div>
                        <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wide">Composed Prompt (sent to model)</div>
                        <pre className="text-[10px] text-zinc-300 bg-zinc-950 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
                            {entry.composed_prompt || <span className="text-zinc-600 italic">empty</span>}
                        </pre>
                    </div>

                    {/* Response */}
                    <div>
                        <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wide">Raw Response</div>
                        <pre className="text-[10px] text-zinc-300 bg-zinc-950 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-48">
                            {entry.response || <span className="text-zinc-600 italic">empty</span>}
                        </pre>
                    </div>

                    {/* Blocks — always rendered */}
                    <div>
                        <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wide">
                            Parsed Blocks ({entry.blocks?.length ?? 0})
                        </div>
                        {(entry.blocks && entry.blocks.length > 0)
                            ? entry.blocks.map((block, bi) => (
                                <BlockRow key={bi} block={block} idx={bi} />
                            ))
                            : <div className="text-[10px] text-zinc-600 italic px-1">no blocks parsed in this entry</div>
                        }
                    </div>
                </div>
            )}
        </div>
    );
}

function TurnRow({ turn, turnIdx, isActive }: { turn: AITurn; turnIdx: number; isActive: boolean }) {
    const [open, setOpen] = useState(false);
    return (
        <div className={`border rounded mb-3 overflow-hidden ${isActive ? 'border-sky-500/50' : 'border-zinc-700/40'}`}>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-800/60 hover:bg-zinc-700/40 text-left"
            >
                <span className="text-zinc-500">{open ? '▾' : '▸'}</span>
                <span className="text-sky-300 font-bold">Turn [{turnIdx}]</span>
                <StatusBadge status={turn.status} />
                {isActive && badge('ACTIVE', 'bg-sky-500/20 text-sky-300 border border-sky-500/30')}
                <span className="ml-auto text-zinc-500 text-[10px]">
                    {ts(turn.at)} · {turn.entries.length} entr{turn.entries.length !== 1 ? 'ies' : 'y'}
                    {' · '}{turn.assistant_renderers.length} renderer{turn.assistant_renderers.length !== 1 ? 's' : ''}
                </span>
            </button>

            {open && (
                <div className="px-3 py-3 space-y-3 bg-zinc-900/30">

                    {/* User renderers */}
                    <div>
                        <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wide">
                            User Renderers ({turn.user_renderers.length})
                        </div>
                        {turn.user_renderers.length === 0
                            ? <div className="text-[10px] text-zinc-600 italic">none</div>
                            : turn.user_renderers.map((r, ri) => (
                                <div key={ri} className="text-[10px] font-mono bg-zinc-950 rounded p-2 mb-1">
                                    <span className="text-pink-300">{r.component_slug}</span>
                                    {r.package_ref && <span className="text-zinc-600"> ({r.package_ref})</span>}
                                    {r.status && <> · <StatusBadge status={r.status} /></>}
                                    <pre className="text-zinc-300 mt-1 whitespace-pre-wrap break-all">
                                        {JSON.stringify(r.payload, null, 2)}
                                    </pre>
                                </div>
                            ))
                        }
                    </div>

                    {/* Assistant renderers */}
                    <div>
                        <div className="text-[10px] text-zinc-500 mb-1 uppercase tracking-wide">
                            Assistant Renderers ({turn.assistant_renderers.length})
                        </div>
                        {turn.assistant_renderers.length === 0
                            ? <div className="text-[10px] text-zinc-600 italic">none</div>
                            : turn.assistant_renderers.map((r, ri) => (
                                <div key={ri} className="text-[10px] font-mono bg-zinc-950 rounded p-2 mb-1">
                                    <span className="text-pink-300">{r.component_slug}</span>
                                    {r.package_ref && <span className="text-zinc-600"> ({r.package_ref})</span>}
                                    {r.status && <> · <StatusBadge status={r.status} /></>}
                                    <pre className="text-zinc-300 mt-1 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                                        {JSON.stringify(r.payload, null, 2)}
                                    </pre>
                                </div>
                            ))
                        }
                    </div>

                    {/* Entries */}
                    <div>
                        <div className="text-[10px] text-zinc-500 mb-2 uppercase tracking-wide">
                            Entries ({turn.entries.length})
                        </div>
                        {turn.entries.map((entry, ei) => (
                            <EntryRow
                                key={ei}
                                entry={entry}
                                idx={ei}
                                isActive={ei === turn.active_entry_index}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function ContextSection({ entries, label, startIdx, endIdx }: {
    entries: AIContextEntry[];
    label: string;
    startIdx: number;
    endIdx: number;
}) {
    const [open, setOpen] = useState(false);
    const windowCount = entries.length > 0 ? entries.slice(startIdx, endIdx + 1).length : 0;

    return (
        <div className="mb-4">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="flex items-center gap-2 text-[11px] text-zinc-400 font-semibold uppercase tracking-wide mb-1 hover:text-zinc-200"
            >
                <span>{open ? '▾' : '▸'}</span>
                {label}
                <span className="text-zinc-600 font-normal normal-case tracking-normal">
                    {entries.length === 0
                        ? '(empty)'
                        : `(${entries.length} total · window [${startIdx}–${endIdx}] = ${windowCount} active)`
                    }
                </span>
            </button>
            {open && (
                <div className="space-y-1 pl-2">
                    {entries.length === 0
                        ? <div className="text-[10px] text-zinc-600 italic">no entries yet</div>
                        : entries.map((entry, ei) => {
                            const inWindow = ei >= startIdx && ei <= endIdx;
                            return (
                                <div key={ei} className={`border rounded px-2 py-1.5 text-[10px] ${entry.status === 'active' ? 'border-emerald-600/40 bg-emerald-950/20' : 'border-zinc-700/30 bg-zinc-900/30'} ${!inWindow ? 'opacity-40' : ''}`}>
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-zinc-500">#{ei}</span>
                                        <StatusBadge status={entry.status} />
                                        <span className="text-zinc-200 font-semibold">{entry.title}</span>
                                        {entry.lifecycle_turn !== undefined && (
                                            <span className="text-zinc-600">turn:{entry.lifecycle_turn}</span>
                                        )}
                                        <span className="ml-auto text-zinc-600">{ts(entry.at)}</span>
                                        {!inWindow && <span className="text-zinc-600 italic">outside window</span>}
                                    </div>
                                    {entry.content && (
                                        <div className="text-zinc-400 mb-1">{entry.content}</div>
                                    )}
                                    {entry.payload && Object.keys(entry.payload).length > 0 && (
                                        <pre className="text-zinc-300 bg-zinc-950 rounded p-1 overflow-x-auto whitespace-pre-wrap break-all max-h-20">
                                            {JSON.stringify(entry.payload, null, 2)}
                                        </pre>
                                    )}
                                </div>
                            );
                        })
                    }
                </div>
            )}
        </div>
    );
}

function HistorySection({ entriesByTurn, startIdx, endIdx }: {
    entriesByTurn: Record<number, AIHistoryEntry>;
    startIdx: number;
    endIdx: number;
}) {
    const [open, setOpen] = useState(false);
    const entries = Object.values(entriesByTurn).sort((a, b) => a.turn_index - b.turn_index);
    const windowCount = entries.filter((entry) => entry.turn_index >= startIdx && entry.turn_index <= endIdx).length;

    return (
        <div className="mb-4">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="flex items-center gap-2 text-[11px] text-zinc-400 font-semibold uppercase tracking-wide mb-1 hover:text-zinc-200"
            >
                <span>{open ? '▾' : '▸'}</span>
                History
                <span className="text-zinc-600 font-normal normal-case tracking-normal">
                    {entries.length === 0
                        ? '(empty)'
                        : `(${entries.length} total · window [${startIdx}–${endIdx}] = ${windowCount} active)`
                    }
                </span>
            </button>
            {open && (
                <div className="space-y-1 pl-2">
                    {entries.length === 0
                        ? <div className="text-[10px] text-zinc-600 italic">no history summaries yet</div>
                        : entries.map((entry) => {
                            const inWindow = entry.turn_index >= startIdx && entry.turn_index <= endIdx;
                            return (
                                <div key={entry.turn_index} className={`border rounded px-2 py-1.5 text-[10px] ${entry.status === 'active' ? 'border-sky-600/40 bg-sky-950/20' : 'border-zinc-700/30 bg-zinc-900/30'} ${!inWindow ? 'opacity-40' : ''}`}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-zinc-500">turn:{entry.turn_index}</span>
                                        <StatusBadge status={entry.status} />
                                        <span className="ml-auto text-zinc-600">{ts(entry.at)}</span>
                                        {!inWindow && <span className="text-zinc-600 italic">outside window</span>}
                                    </div>
                                    {entry.prompt && (
                                        <div className="mb-1">
                                            <div className="text-zinc-500 uppercase tracking-wide">Prompt</div>
                                            <div className="text-zinc-300 whitespace-pre-wrap">{entry.prompt}</div>
                                        </div>
                                    )}
                                    {entry.response && (
                                        <div className="mb-1">
                                            <div className="text-zinc-500 uppercase tracking-wide">Response</div>
                                            <div className="text-zinc-300 whitespace-pre-wrap">{entry.response}</div>
                                        </div>
                                    )}
                                    {entry.payload && Object.keys(entry.payload).length > 0 && (
                                        <pre className="text-zinc-300 bg-zinc-950 rounded p-1 overflow-x-auto whitespace-pre-wrap break-all max-h-20">
                                            {JSON.stringify(entry.payload, null, 2)}
                                        </pre>
                                    )}
                                </div>
                            );
                        })}
                </div>
            )}
        </div>
    );
}

function WorkingMemorySection({ entries }: {
    entries: AIWorkingMemoryEntry[];
}) {
    const [open, setOpen] = useState(false);

    return (
        <div className="mb-4">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="flex items-center gap-2 text-[11px] text-zinc-400 font-semibold uppercase tracking-wide mb-1 hover:text-zinc-200"
            >
                <span>{open ? '▾' : '▸'}</span>
                Working Memory
                <span className="text-zinc-600 font-normal normal-case tracking-normal">
                    {entries.length === 0 ? '(empty)' : `(${entries.length} total)`}
                </span>
            </button>
            {open && (
                <div className="space-y-1 pl-2">
                    {entries.length === 0
                        ? <div className="text-[10px] text-zinc-600 italic">no working memory entries yet</div>
                        : entries.map((entry, idx) => (
                            <div key={`${entry.uid}-${idx}`} className="border border-fuchsia-700/30 bg-fuchsia-950/10 rounded px-2 py-1.5 text-[10px]">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-zinc-500">#{idx}</span>
                                    <span className="text-fuchsia-300 font-semibold">{entry.uid}</span>
                                    {entry.lifecycle_turn !== undefined && (
                                        <span className="text-zinc-600">turn:{entry.lifecycle_turn}</span>
                                    )}
                                    <span className="ml-auto text-zinc-600">{ts(entry.created_at)}</span>
                                </div>
                                <div className="text-zinc-400 mb-1">{entry.description}</div>
                                <pre className="text-zinc-300 bg-zinc-950 rounded p-1 overflow-x-auto whitespace-pre-wrap break-all max-h-28 overflow-y-auto">
                                    {entry.content}
                                </pre>
                            </div>
                        ))}
                </div>
            )}
        </div>
    );
}

// Flat panel: all parsed blocks across every turn/entry in linear order
function AllBlocksPanel({ session }: { session: AISession }) {
    const [open, setOpen] = useState(false);

    // Collect all blocks from all turns / entries
    const allBlocks: Array<{ block: AIBlock; turnIdx: number; entryIdx: number }> = [];
    session.turns.forEach((turn, ti) => {
        turn.entries.forEach((entry, ei) => {
            (entry.blocks ?? []).forEach(block => {
                allBlocks.push({ block, turnIdx: ti, entryIdx: ei });
            });
        });
    });

    const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

    return (
        <div className="mb-4">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="flex items-center gap-2 text-[11px] text-zinc-400 font-semibold uppercase tracking-wide mb-1 hover:text-zinc-200"
            >
                <span>{open ? '▾' : '▸'}</span>
                All Parsed Blocks
                <span className="text-zinc-600 font-normal normal-case tracking-normal">
                    {allBlocks.length === 0 ? '(none yet)' : `(${allBlocks.length} total)`}
                </span>
            </button>
            {open && (
                <div className="space-y-1 pl-2">
                    {allBlocks.length === 0
                        ? <div className="text-[10px] text-zinc-600 italic">no blocks parsed in this session yet</div>
                        : allBlocks.map(({ block, turnIdx, entryIdx }, i) => {
                            const exp = expandedIdx === i;
                            return (
                                <div key={i} className="border border-zinc-700/40 rounded overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setExpandedIdx(exp ? null : i)}
                                        className="w-full flex items-center gap-2 px-2 py-1 bg-zinc-800/50 hover:bg-zinc-700/40 text-left"
                                    >
                                        <span className="text-zinc-500">{exp ? '▾' : '▸'}</span>
                                        <span className="text-purple-300 font-semibold">&lt;{block.block_slug}&gt;</span>
                                        {block.package_ref && <span className="text-zinc-600 text-[10px]">{block.package_ref}</span>}
                                        <span className="ml-auto text-zinc-600 text-[10px]">
                                            t{turnIdx} · e{entryIdx} · b{block.block_index}
                                        </span>
                                    </button>
                                    {exp && (
                                        <div className="px-3 py-2 bg-zinc-900/60">
                                            <pre className="text-[10px] text-zinc-300 bg-zinc-950 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-40">
                                                {JSON.stringify(block.payload, null, 2)}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    }
                </div>
            )}
        </div>
    );
}

function SessionCard({ session }: { session: AISession }) {
    const [open, setOpen] = useState(true);

    return (
        <div className="border border-zinc-700/50 rounded-lg mb-4 overflow-hidden">
            {/* Session Header */}
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center gap-2 px-3 py-2.5 bg-zinc-800/80 hover:bg-zinc-700/50 text-left"
            >
                <span className="text-zinc-500">{open ? '▾' : '▸'}</span>
                <span className="text-emerald-300 font-bold text-xs">Session</span>
                <span className="text-zinc-400 font-mono text-[10px]">{session.session_uid}</span>
                <StatusBadge status={session.status} />
                <span className="text-sky-400 text-[10px]">{session.state}</span>
                <span className="text-zinc-600 text-[10px]">{session.sdk} / {session.model}</span>
                <span className="ml-auto text-zinc-600 text-[10px]">
                    t:{session.turn_index} · {session.turns.length} turn{session.turns.length !== 1 ? 's' : ''}
                </span>
            </button>

            {open && (
                <div className="px-3 py-3 space-y-4 bg-zinc-950/50">

                    {/* Meta row */}
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="bg-zinc-900 rounded p-2 space-y-1">
                            <div className="text-zinc-500 uppercase tracking-wide mb-1">Session Meta</div>
                            <div><span className="text-zinc-500">process:</span> <span className="text-zinc-300 font-mono">{session.process_uid}</span></div>
                            <div><span className="text-zinc-500">autonomous_loop:</span> <StatusBadge status={session.autonomous_follow_up_loop_status} /></div>
                            <div><span className="text-zinc-500">active_parser_blocks:</span> <span className="text-zinc-300">{session.active_parser_blocks?.length ?? 0}</span></div>
                            <div><span className="text-zinc-500">ctx window:</span> <span className="text-zinc-300">[{session.context_start_index}–{session.context_end_index}]</span></div>
                            <div><span className="text-zinc-500">hist window:</span> <span className="text-zinc-300">[{session.history_start_index}–{session.history_end_index}]</span></div>
                        </div>
                        <div className="bg-zinc-900 rounded p-2 space-y-1">
                            <div className="text-zinc-500 uppercase tracking-wide mb-1">Error Payload</div>
                            {session.error_payload
                                ? <pre className="text-rose-300 whitespace-pre-wrap break-all">{JSON.stringify(session.error_payload, null, 2)}</pre>
                                : <span className="text-zinc-600 italic">none</span>
                            }
                        </div>
                    </div>

                    {/* Plan */}
                    {session.plan && session.plan.length > 0 && (
                        <div>
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Plan ({session.plan.length})</div>
                            {session.plan.map((p, pi) => (
                                <div key={pi} className={`flex items-start gap-2 text-[10px] px-2 py-1 rounded mb-1 ${p.is_complete ? 'bg-emerald-950/20 text-zinc-300' : 'bg-zinc-900 text-zinc-400'}`}>
                                    <span>{p.is_complete ? '✓' : '○'}</span>
                                    <span>{p.detail as string ?? JSON.stringify(p)}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Active Parser Blocks */}
                    {session.active_parser_blocks && session.active_parser_blocks.length > 0 && (
                        <div>
                            <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Active Parser Blocks</div>
                            {session.active_parser_blocks.map((b, bi) => (
                                <div key={bi} className="text-[10px] font-mono bg-zinc-900 rounded px-2 py-1 mb-1 flex gap-3">
                                    <span className="text-purple-300">&lt;{b.block_slug}&gt;</span>
                                    {b.package_ref && <span className="text-zinc-600">{b.package_ref}</span>}
                                    {b.lifecycle_turn !== undefined && <span className="text-zinc-600">turn:{b.lifecycle_turn}</span>}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* All Blocks — flat cross-turn scan */}
                    <AllBlocksPanel session={session} />

                    {/* Context */}
                    <ContextSection
                        entries={session.context}
                        label="Context"
                        startIdx={session.context_start_index}
                        endIdx={session.context_end_index}
                    />

                    <WorkingMemorySection entries={session.working_memory} />

                    {/* History */}
                    <HistorySection
                        entriesByTurn={session.history}
                        startIdx={session.history_start_index}
                        endIdx={session.history_end_index}
                    />

                    {/* Turns */}
                    <div>
                        <div className="text-[10px] text-zinc-500 uppercase tracking-wide mb-2">
                            Turns ({session.turns.length})
                        </div>
                        {session.turns.map((turn, ti) => (
                            <TurnRow
                                key={ti}
                                turn={turn}
                                turnIdx={ti}
                                isActive={ti === session.turn_index}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ============================================================
// Main Inspector Component
// ============================================================

export const registry = {
    name: 'ai_session_inspector',
    slug: 'ai-session-inspector',
    react_behavior: 'ai_session_inspector',
};

export default function AISessionInspector() {
    const [sessions, setSessions] = useState<AISession[]>([]);
    const [filter, setFilter] = useState('');
    const [refreshRate, setRefreshRate] = useState(2000);
    const [lastRefresh, setLastRefresh] = useState(Date.now());

    const refresh = () => {
        try {
            const all = KernelEngine.getAllMemoryKeys();
            const sessionKeys = all.filter((k: string) =>
                k.startsWith('system:ai_session:') && k.endsWith(':state')
            );
            const loaded: AISession[] = sessionKeys
                .map((k: string) => KernelEngine.readMemory(k) as AISession)
                .filter(Boolean);
            setSessions(loaded);
            setLastRefresh(Date.now());
        } catch (err) {
            console.error('[AISessionInspector] refresh error:', err);
        }
    };

    useEffect(() => {
        refresh();
        const id = setInterval(refresh, refreshRate);
        return () => clearInterval(id);
    }, [refreshRate]);

    const filtered = sessions.filter(s => {
        if (!filter.trim()) return true;
        const q = filter.toLowerCase();
        return (
            s.session_uid.toLowerCase().includes(q) ||
            s.status.toLowerCase().includes(q) ||
            s.state?.toLowerCase().includes(q) ||
            (s.sdk ?? '').toLowerCase().includes(q) ||
            (s.model ?? '').toLowerCase().includes(q)
        );
    });

    return (
        <div className="h-full w-full flex flex-col bg-zinc-950 text-zinc-100 text-xs font-mono">

            {/* Toolbar */}
            <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-3 shrink-0">
                <div className="text-zinc-200 font-semibold">AI Session Inspector</div>
                <div className="text-zinc-500">{sessions.length} session{sessions.length !== 1 ? 's' : ''}</div>
                <div className="ml-auto flex items-center gap-2">
                    <span className="text-zinc-600 text-[10px]">refresh:</span>
                    {[500, 1000, 2000, 5000].map(ms => (
                        <button
                            key={ms}
                            type="button"
                            onClick={() => setRefreshRate(ms)}
                            className={`px-1.5 py-0.5 rounded text-[10px] border ${refreshRate === ms
                                ? 'border-sky-500/60 text-sky-300 bg-sky-500/10'
                                : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
                                }`}
                        >
                            {ms < 1000 ? `${ms}ms` : `${ms / 1000}s`}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={refresh}
                        className="px-2 py-0.5 rounded border border-zinc-600 text-zinc-300 hover:bg-zinc-800 text-[10px]"
                    >
                        ↺ Refresh
                    </button>
                    <span className="text-zinc-700 text-[10px]">{new Date(lastRefresh).toLocaleTimeString()}</span>
                </div>
            </div>

            {/* Filter bar */}
            <div className="px-3 py-2 border-b border-zinc-800 shrink-0">
                <input
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    placeholder="filter by session_uid / status / state / sdk / model"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-200 outline-none focus:border-zinc-500"
                />
            </div>

            {/* Sessions list */}
            <div className="flex-1 overflow-auto px-3 py-3">
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-2">
                        <div className="text-2xl">◎</div>
                        <div>{sessions.length === 0 ? 'No active AI sessions found in RAM.' : 'No sessions match filter.'}</div>
                    </div>
                ) : (
                    filtered.map(session => (
                        <SessionCard key={session.session_uid} session={session} />
                    ))
                )}
            </div>
        </div>
    );
}
