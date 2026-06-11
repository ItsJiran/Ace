/**
 * FileProgressBlock — renders <files> XML tags from action_read_file.
 *
 * XML format:
 *   <files>
 *     <entry path="config.yaml" size="1520" status="ok" />
 *     <entry path=".env" status="pending" />
 *     <entry path="bad.txt" status="fail">error msg</entry>
 *   </files>
 */

import React from 'react';
import { FileText, Loader } from 'lucide-react';

export interface FileProgressBlockProps {
    text: string;
    done?: boolean;
    isLast?: boolean;
}

interface EntryItem {
    path: string;
    status: string;
    size?: string;
    error?: string;
    content?: string;
}

function parseEntries(text: string): EntryItem[] {
    const entries: EntryItem[] = [];

    // With body: <entry path="x" size="1520" status="ok">content here</entry>
    const withBody = /<entry\s+([^>]+)>([\s\S]*?)<\/entry>/g;
    let m: RegExpExecArray | null;
    while ((m = withBody.exec(text)) !== null) {
        const a = m[1];
        entries.push({
            path: a.match(/path="([^"]+)"/)?.[1] ?? '',
            status: a.match(/status="([^"]+)"/)?.[1] ?? '',
            size: a.match(/size="([^"]+)"/)?.[1],
            error: m[2].trim() && a.match(/status="fail"/) ? m[2].trim() : undefined,
            content: m[2].trim() && !a.match(/status="fail"/) ? m[2].trim() : undefined,
        });
    }

    // Self-closing: <entry path="x" size="1520" status="ok" />
    const selfClose = /<entry\s+([^>]+)\/>/g;
    while ((m = selfClose.exec(text)) !== null) {
        const a = m[1];
        entries.push({
            path: a.match(/path="([^"]+)"/)?.[1] ?? '',
            status: a.match(/status="([^"]+)"/)?.[1] ?? '',
            size: a.match(/size="([^"]+)"/)?.[1],
        });
    }

    return entries;
}

export function FileProgressBlock({ text, done, isLast }: FileProgressBlockProps) {
    const entries = parseEntries(text);
    if (entries.length === 0) return null;

    const hasPending = entries.some(e => e.status === 'pending');
    const okCount = entries.filter(e => e.status === 'ok').length;
    const failCount = entries.filter(e => e.status === 'fail').length;

    return (
        <div className="flex gap-2">
            <div className="flex flex-col items-center shrink-0">
                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-500/10 shrink-0">
                    <FileText className="w-3 h-3 text-blue-400" />
                </div>
                {!isLast && <div className="w-px flex-1 min-h-[6px] bg-zinc-700/40" />}
            </div>
            <div className="flex flex-col gap-0.5 min-w-0 flex-1 pb-2">
                <div className="flex items-center gap-1">
                    <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">
                        Files
                    </span>
                    {hasPending && (
                        <Loader className="w-3 h-3 text-blue-400 animate-spin" />
                    )}
                    {!hasPending && (
                        <span className="text-[10px] text-zinc-500">
                            ({okCount} read{failCount > 0 ? `, ${failCount} failed` : ''})
                        </span>
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
                                    className={`text-[11px] ${
                                        isOk ? 'text-emerald-400' : isFail ? 'text-red-400' : 'text-zinc-400'
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] shrink-0">
                                            {isOk ? '✅' : isFail ? '❌' : '○'}
                                        </span>
                                        <code className={isOk ? 'text-emerald-300/80' : isFail ? 'text-red-300/80' : 'text-blue-400/80'}>
                                            {e.path}
                                        </code>
                                        {isOk && e.size && (
                                            <span className="text-zinc-500">({e.size} chars)</span>
                                        )}
                                        {isPending && (
                                            <span className="text-zinc-500">reading...</span>
                                        )}
                                        {isFail && e.error && (
                                            <span className="text-zinc-500 truncate">{e.error}</span>
                                        )}
                                    </div>
                                    {isOk && e.content && (
                                        <div className="ml-5 mt-0.5 text-[10px] font-mono rounded px-1.5 py-0.5 bg-blue-500/5 text-blue-400/70 max-h-24 overflow-y-auto whitespace-pre-wrap">
                                            {e.content}
                                        </div>
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
