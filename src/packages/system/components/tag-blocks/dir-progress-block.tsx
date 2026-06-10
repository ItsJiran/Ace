/**
 * DirProgressBlock — renders <dir> XML tags from action_list_directory.
 *
 * Infers state from entry statuses (no status attribute needed on parent).
 *
 * XML format:
 *   <dir>
 *     <entry path="src" entries="15" status="ok" />
 *     <entry path="tests" status="pending" />
 *     <entry path="lib" status="fail">error msg</entry>
 *   </dir>
 */

import React from 'react';
import { Folder, Loader } from 'lucide-react';

export interface DirProgressBlockProps {
    text: string;
    done?: boolean;
    isLast?: boolean;
}

interface EntryItem {
    path: string;
    status: string;
    entries?: string;
    error?: string;
}

function parseEntries(text: string): EntryItem[] {
    const entries: EntryItem[] = [];

    // Self-closing: <entry path="x" entries="15" status="ok" />
    const selfClose = /<entry\s+([^>]+)\/>/g;
    let m: RegExpExecArray | null;
    while ((m = selfClose.exec(text)) !== null) {
        const a = m[1];
        entries.push({
            path: a.match(/path="([^"]+)"/)?.[1] ?? '',
            status: a.match(/status="([^"]+)"/)?.[1] ?? '',
            entries: a.match(/entries="([^"]+)"/)?.[1],
        });
    }

    // With error text: <entry path="x" status="fail">msg</entry>
    const withBody = /<entry\s+([^>]+)>([\s\S]*?)<\/entry>/g;
    while ((m = withBody.exec(text)) !== null) {
        const a = m[1];
        entries.push({
            path: a.match(/path="([^"]+)"/)?.[1] ?? '',
            status: a.match(/status="([^"]+)"/)?.[1] ?? '',
            error: m[2].trim(),
        });
    }

    return entries;
}

export function DirProgressBlock({ text, done, isLast }: DirProgressBlockProps) {
    const entries = parseEntries(text);
    if (entries.length === 0) return null;

    const hasPending = entries.some(e => e.status === 'pending');

    return (
        <div className="flex gap-2">
            <div className="flex flex-col items-center shrink-0">
                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/10 shrink-0">
                    <Folder className="w-3 h-3 text-amber-400" />
                </div>
                {!isLast && <div className="w-px flex-1 min-h-[6px] bg-zinc-700/40" />}
            </div>
            <div className="flex flex-col gap-0.5 min-w-0 flex-1 pb-2">
                <div className="flex items-center gap-1">
                    <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">
                        Directory
                    </span>
                    {hasPending && (
                        <Loader className="w-3 h-3 text-amber-400 animate-spin" />
                    )}
                </div>
                <div className="border-l border-zinc-700/40 pl-2 py-0.5">
                    <div className="flex flex-col gap-1">
                        {entries.map((e, i) => {
                            const isOk = e.status === 'ok';
                            const isPending = e.status === 'pending';
                            const isFail = e.status === 'fail';

                            return (
                                <div
                                    key={`${e.path}-${i}`}
                                    className={`flex items-center gap-1.5 text-[11px] ${
                                        isOk ? 'text-emerald-400' : isFail ? 'text-red-400' : 'text-zinc-400'
                                    }`}
                                >
                                    <span className="text-[10px] shrink-0">
                                        {isOk ? '✅' : isFail ? '❌' : '○'}
                                    </span>
                                    <code className={isOk ? 'text-emerald-300/80' : isFail ? 'text-red-300/80' : 'text-amber-400/80'}>
                                        {e.path}
                                    </code>
                                    {isOk && e.entries && (
                                        <span className="text-zinc-500">({e.entries} entries)</span>
                                    )}
                                    {isPending && (
                                        <span className="text-zinc-500">listing...</span>
                                    )}
                                    {isFail && e.error && (
                                        <span className="text-zinc-500 truncate">{e.error}</span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
