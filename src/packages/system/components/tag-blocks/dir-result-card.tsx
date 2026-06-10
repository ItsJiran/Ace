/**
 * DirResultCard — renders settled <dir> XML from action_list_directory.
 *
 * Standalone card (not part of reasoning accordion). Shows summary
 * collapsed, expands to show per-directory entry listing.
 */

import React, { useState } from 'react';
import { Folder, ChevronDown } from 'lucide-react';

export interface DirResultCardProps {
    text: string;
    done?: boolean;
}

interface DirEntry {
    path: string;
    entries?: string;
    files: string[];
    dirs: string[];
    hasMore: boolean;
    moreCount: number;
}

function parseDirEntries(text: string): DirEntry[] {
    const result: DirEntry[] = [];
    // Match <entry path="x" entries="N" status="ok">...children...</entry>
    const regex = /<entry\s+path="([^"]+)"\s+entries="([^"]+)"\s+status="ok">([\s\S]*?)<\/entry>/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
        const files: string[] = [];
        const dirs: string[] = [];
        let hasMore = false;
        let moreCount = 0;
        const body = m[3];
        // Parse <file>name</file> and <dir>name/</dir>
        const fileRe = /<file>([^<]+)<\/file>/g;
        let fm: RegExpExecArray | null;
        while ((fm = fileRe.exec(body)) !== null) files.push(fm[1]);
        const dirRe = /<dir>([^<]+)\/?<\/dir>/g;
        while ((fm = dirRe.exec(body)) !== null) dirs.push(fm[1]);
        const moreRe = /<more>\+(\d+) more<\/more>/;
        const moreM = moreRe.exec(body);
        if (moreM) { hasMore = true; moreCount = parseInt(moreM[1], 10); }
        result.push({ path: m[1], entries: m[2], files, dirs, hasMore, moreCount });
    }
    return result;
}

export function DirResultCard({ text, done }: DirResultCardProps) {
    const dirs = parseDirEntries(text);
    if (dirs.length === 0) return null;

    const [open, setOpen] = useState(false);

    const summary = dirs
        .map(d => `${d.path}/ (${d.entries} entries)`)
        .join(', ');

    if (!open) {
        return (
            <div className="flex justify-start mb-2">
                <div className="flex min-w-0 max-w-[88%] flex-col items-start gap-1">
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-700/30 bg-zinc-800/20 hover:bg-zinc-800/40 transition-colors text-left w-full"
                    >
                        <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="text-xs text-zinc-300">
                            📂 {dirs.length} director{dirs.length > 1 ? 'ies' : 'y'}: {summary}
                        </span>
                        <ChevronDown className="w-3 h-3 text-zinc-500 ml-auto" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex justify-start mb-2">
            <div className="flex min-w-0 max-w-[88%] flex-col items-start gap-1 w-full">
                <div className="rounded-lg border border-zinc-700/30 bg-zinc-800/20 overflow-hidden w-full">
                    {/* Header */}
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2 px-3 py-2 w-full hover:bg-zinc-700/20 transition-colors"
                    >
                        <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="text-xs text-zinc-300">
                            📂 {dirs.length} director{dirs.length > 1 ? 'ies' : 'y'}
                        </span>
                        <ChevronDown className="w-3 h-3 text-zinc-500 ml-auto" />
                    </button>

                    {/* Directory entries with file listing */}
                    <div className="border-t border-zinc-700/30">
                        {dirs.map((d, i) => (
                            <div
                                key={d.path}
                                className={i < dirs.length - 1 ? 'border-b border-zinc-700/20' : ''}
                            >
                                <div className="flex items-center gap-2 px-4 py-1.5 text-xs">
                                    <span className="text-emerald-400 text-[10px]">✅</span>
                                    <code className="text-emerald-300/80">{d.path}/</code>
                                    <span className="text-zinc-500 ml-auto">{d.entries} entries</span>
                                </div>
                                {(d.files.length > 0 || d.dirs.length > 0) && (
                                    <div className="px-6 pb-1.5 grid grid-cols-3 gap-x-3 gap-y-0.5">
                                        {d.dirs.map((name, j) => (
                                            <div key={`dir-${j}`} className="flex items-center gap-1 text-[10px] text-amber-400/80">
                                                <Folder className="w-3 h-3 shrink-0" />
                                                <span className="truncate">{name}/</span>
                                            </div>
                                        ))}
                                        {d.files.map((name, j) => (
                                            <div key={`file-${j}`} className="flex items-center gap-1 text-[10px] text-zinc-400">
                                                <span className="w-3 h-3 shrink-0 text-zinc-600 text-[8px] text-center leading-3">○</span>
                                                <span className="truncate">{name}</span>
                                            </div>
                                        ))}
                                        {d.hasMore && (
                                            <div className="text-[10px] text-zinc-600 italic col-span-3 mt-0.5">
                                                +{d.moreCount} more entries...
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
