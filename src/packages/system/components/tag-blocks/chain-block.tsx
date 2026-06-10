/**
 * ChainBlock — unified left-bordered panel shared by all tag blocks.
 *
 * Renders as:
 *   [icon]  LABEL  ●pulse
 *   ┃  content text...
 *
 * The vertical chain connector is managed by the parent (XmlTagAccordion)
 * via `isLast` — the last block omits the downward connector line.
 */
import React, { ReactNode } from 'react';

export interface ChainBlockProps {
    icon: ReactNode;
    label: string;
    /** Combined Tailwind classes for icon+label color AND border color.
     *  e.g. "text-purple-400 border-purple-500/40" */
    accentClass: string;
    text: string;
    done?: boolean;
    /** True for all blocks except the last one in the chain. */
    isLast?: boolean;
}

export function ChainBlock({
    icon,
    label,
    accentClass,
    text,
    done = true,
    isLast = false,
}: ChainBlockProps) {
    if (!text && done) return null;

    // Split "text-purple-400 border-purple-500/40" → fg + border + bg-line
    const parts = accentClass.split(/\s+/);
    const fgColor = parts[0];                          // text-purple-400
    const borderColor = parts[1];                       // border-purple-500/40
    const lineColor = borderColor?.replace('border-', 'bg-'); // bg-purple-500/40

    return (
        <div className="flex gap-2">
            {/* Left rail column: icon → vertical line → (nothing if last) */}
            <div className="flex flex-col items-center shrink-0">
                {/* Icon circle */}
                <div className={[
                    'flex items-center justify-center w-5 h-5 rounded-full shrink-0',
                    fgColor?.replace('text-', 'bg-') + '/5',
                ].join(' ')}>
                    <span className={fgColor}>{icon}</span>
                </div>
                {/* Vertical chain line (skip for last block) */}
                {!isLast && (
                    <div className={['w-px flex-1 min-h-[6px]', 'bg-gray-500/40'].join(' ')} />
                )}
            </div>

            {/* Content panel */}
            <div className={['flex flex-col min-w-0 flex-1', !isLast ? 'pb-2' : ''].join(' ')}>
                <div className="flex items-center gap-1">
                    <span className={['text-[10px] font-semibold uppercase tracking-wider', fgColor].join(' ')}>
                        {label}
                    </span>
                    {!done && (
                        <span className={['inline-block w-1.5 h-1.5 rounded-full animate-pulse', fgColor?.replace('text-', 'bg-')].join(' ')} />
                    )}
                </div>
                <div className={[' py-0.5 rounded-l-sm'].join(' ')}>
                    <div className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">
                        {text || '\u00A0'}
                    </div>
                </div>
            </div>
        </div>
    );
}

