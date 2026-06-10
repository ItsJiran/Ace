/**
 * InterruptBlock — renders <interrupt> XML tags from recovery flow.
 *
 * The tag contains a JSON payload:
 *   { blockTag, code, message, node, actions: [{ id, label }] }
 *
 * blockTag determines which sub-renderer to use:
 *   network_interrupt_continue → error message + Continue button
 */

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export interface InterruptBlockProps {
    text: string;
    done?: boolean;
    isLast?: boolean;
}

interface InterruptPayload {
    blockTag: string;
    code: string;
    message: string;
    node: string;
    actions: Array<{ id: string; label: string }>;
}

function parsePayload(text: string): InterruptPayload | null {
    try {
        const trimmed = text.trim();
        if (!trimmed) return null;
        return JSON.parse(trimmed) as InterruptPayload;
    } catch {
        return null;
    }
}

export function InterruptBlock({ text, done, isLast }: InterruptBlockProps) {
    const payload = parsePayload(text);
    if (!payload) {
        // Fallback: plain error display
        return (
            <div className="flex items-start gap-2 text-amber-400">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="text-sm">{text || 'Interrupted.'}</div>
            </div>
        );
    }

    switch (payload.blockTag) {

        // ── Network / LLM error → Continue button ──────────────────────
        case 'network_interrupt_continue':
            return (
                <div className="flex flex-col gap-2.5 border border-amber-500/20 bg-amber-500/5 rounded-lg px-3 py-2.5">
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                        <div className="flex flex-col gap-1 min-w-0">
                            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                                Network Error
                            </span>
                            <span className="text-xs text-zinc-400 leading-relaxed">
                                {payload.message}
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="inline-flex items-center gap-1.5 self-start px-3 py-1.5 rounded-md
                                   bg-amber-500/15 text-amber-300 text-xs font-semibold
                                   hover:bg-amber-500/25 active:scale-[0.97] transition-all"
                        onClick={() => {
                            window.dispatchEvent(
                                new CustomEvent('ace:interrupt-continue', {
                                    detail: { blockTag: payload.blockTag, code: payload.code },
                                }),
                            );
                        }}
                    >
                        <RefreshCw className="w-3 h-3" />
                        Continue
                    </button>
                </div>
            );

        // ── Unknown blockTag — plain display ───────────────────────────
        default:
            return (
                <div className="flex items-start gap-2 text-zinc-400">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div className="text-sm">{payload.message}</div>
                </div>
            );
    }
}
