/**
 * XmlTagAccordion — collapsible chain of tag blocks.
 *
 * Wraps a sequence of TagBlock items (thought → action_type → reason)
 * in an accordion. When expanded, shows the full chain with vertical
 * connectors. When collapsed, shows a one-line preview of the last block.
 *
 * During streaming (any block not done), the accordion auto-expands.
 */
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ThoughtBlock, InterruptBlock, DirProgressBlock } from './tag-blocks';
import type { TagBlock } from './xml-tag-renderer';

/** Tag → renderer mapping. Each renderer receives {text, done, isLast}. */
type TagRenderer = React.ComponentType<{ text: string; done?: boolean; isLast?: boolean }>;

const TAG_RENDERERS: Record<string, TagRenderer> = {
    thought: ThoughtBlock,
    interrupt: InterruptBlock,
    dir: DirProgressBlock,
};

/** Truncate text for collapsed preview. */
function previewText(text: string, maxLen = 60): string {
    const single = text.replace(/\n/g, ' ').trim();
    if (single.length <= maxLen) return single;
    return single.slice(0, maxLen) + '…';
}

export interface XmlTagAccordionProps {
    blocks: TagBlock[];
}

export function XmlTagAccordion({ blocks }: XmlTagAccordionProps) {
    const [open, setOpen] = useState(false);

    if (blocks.length === 0) return null;

    // ---- Collapsed: show last block preview ----
    if (!open) {
        const last = blocks[blocks.length - 1];
        const label = last.tag.replace(/_/g, ' ');
        const snippet = previewText(last.text);

        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex items-center gap-1.5 w-full text-left group hover:bg-zinc-800/40 rounded-md px-1.5 py-1 -mx-1.5 transition-colors"
            >
                <ChevronDown className="w-3 h-3 text-zinc-500 rotate-[-90deg] group-hover:text-zinc-300 transition-colors shrink-0" />
                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider shrink-0">
                    {label}
                </span>
                <span className="text-[11px] text-zinc-500 truncate min-w-0">
                    {snippet || (last.done ? '—' : '…')}
                </span>
                {!last.done && (
                    <span className="inline-block w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse shrink-0" />
                )}
            </button>
        );
    }

    // ---- Expanded: full chain ----
    return (
        <div className="flex flex-col">
            {/* Toggle bar */}
            <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex items-center gap-1 group mb-1.5 hover:opacity-80 transition-opacity"
            >
                <ChevronDown className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                <span className="text-[9px] font-medium text-zinc-500 uppercase tracking-widest">
                    Reasoning
                </span>
            </button>

            {/* Chain of blocks */}
            <div className="flex flex-col">
                {blocks.map((block, i) => {
                    const Renderer = TAG_RENDERERS[block.tag];
                    if (!Renderer) {
                        // Fallback for unknown tags
                        return (
                            <div key={`tag-${i}`} className="flex gap-2 pb-2">
                                <div className="flex flex-col items-center shrink-0">
                                    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-700/30 shrink-0">
                                        <span className="text-[9px] text-zinc-500 font-mono uppercase">{block.tag.slice(0, 2)}</span>
                                    </div>
                                    {i < blocks.length - 1 && (
                                        <div className="w-px flex-1 min-h-[6px] bg-zinc-700/40" />
                                    )}
                                </div>
                                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                                        {block.tag}
                                    </span>
                                    <div className="border-l border-zinc-700/40 pl-2 py-0.5">
                                        <div className="text-xs text-zinc-500 whitespace-pre-wrap">
                                            {block.text || '\u00A0'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    const isLast = i === blocks.length - 1;
                    return (
                        <Renderer
                            key={`tag-${i}`}
                            text={block.text}
                            done={block.done}
                            isLast={isLast}
                        />
                    );
                })}
            </div>
        </div>
    );
}
