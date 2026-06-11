/**
 * ShellProgressBlock — renders <shell> XML tags from action_shell.
 *
 * XML format:
 *   <shell>
 *     <cmd status="ok" command="node --version">v22.1.0</cmd>
 *     <cmd status="fail" command="npm install bad">error msg</cmd>
 *     <cmd status="pending" command="npm run build" />
 *   </shell>
 */

import React from 'react';
import { Terminal, Loader } from 'lucide-react';

export interface ShellProgressBlockProps {
    text: string;
    done?: boolean;
    isLast?: boolean;
}

interface CmdItem {
    status: string;
    command: string;
    output: string;
}

function parseCommands(text: string): CmdItem[] {
    const commands: CmdItem[] = [];

    // Self-closing: <cmd status="pending" command="npm run build" />
    const selfClose = /<cmd\s+([^>]+)\/>/g;
    let m: RegExpExecArray | null;
    while ((m = selfClose.exec(text)) !== null) {
        const a = m[1];
        commands.push({
            status: a.match(/status="([^"]+)"/)?.[1] ?? '',
            command: a.match(/command="([^"]+)"/)?.[1] ?? '',
            output: '',
        });
    }

    // With body: <cmd status="ok" command="node --version">v22.1.0</cmd>
    const withBody = /<cmd\s+([^>]+)>([\s\S]*?)<\/cmd>/g;
    while ((m = withBody.exec(text)) !== null) {
        const a = m[1];
        commands.push({
            status: a.match(/status="([^"]+)"/)?.[1] ?? '',
            command: a.match(/command="([^"]+)"/)?.[1] ?? '',
            output: m[2].trim(),
        });
    }

    return commands;
}

export function ShellProgressBlock({ text, done, isLast }: ShellProgressBlockProps) {
    const commands = parseCommands(text);
    if (commands.length === 0) return null;

    const hasPending = commands.some(c => c.status === 'pending');
    const okCount = commands.filter(c => c.status === 'ok').length;
    const failCount = commands.filter(c => c.status === 'fail').length;

    return (
        <div className="flex gap-2">
            <div className="flex flex-col items-center shrink-0">
                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/10 shrink-0">
                    <Terminal className="w-3 h-3 text-emerald-400" />
                </div>
                {!isLast && <div className="w-px flex-1 min-h-[6px] bg-zinc-700/40" />}
            </div>
            <div className="flex flex-col gap-0.5 min-w-0 flex-1 pb-2">
                <div className="flex items-center gap-1">
                    <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                        Shell
                    </span>
                    {hasPending && (
                        <Loader className="w-3 h-3 text-emerald-400 animate-spin" />
                    )}
                    {!hasPending && (
                        <span className="text-[10px] text-zinc-500">
                            ({okCount} ok{failCount > 0 ? `, ${failCount} failed` : ''})
                        </span>
                    )}
                </div>
                <div className="border-l border-zinc-700/40 pl-2 py-0.5">
                    <div className="flex flex-col gap-1">
                        {commands.map((c, i) => {
                            const isOk = c.status === 'ok';
                            const isPending = c.status === 'pending';
                            const isFail = c.status === 'fail';

                            return (
                                <div
                                    key={`${c.command}-${i}`}
                                    className={`flex flex-col gap-0.5 text-[11px] ${
                                        isOk ? 'text-emerald-400' : isFail ? 'text-red-400' : 'text-zinc-400'
                                    }`}
                                >
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] shrink-0">
                                            {isOk ? '✅' : isFail ? '❌' : '○'}
                                        </span>
                                        <code className={`text-[11px] ${
                                            isOk ? 'text-emerald-300/80' : isFail ? 'text-red-300/80' : 'text-zinc-400'
                                        }`}>
                                            {c.command}
                                        </code>
                                    </div>
                                    {c.output && (
                                        <div className={`ml-4 text-[10px] font-mono rounded px-1.5 py-0.5 ${
                                            isOk ? 'bg-emerald-500/5 text-emerald-400/70' :
                                            isFail ? 'bg-red-500/5 text-red-400/70' :
                                            'bg-zinc-800 text-zinc-500'
                                        }`}>
                                            {c.output.slice(0, 200)}
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
