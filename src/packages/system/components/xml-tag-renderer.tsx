/**
 * XmlTagRenderer — renders raw XML as per-tag blocks.
 *
 * Each <tag>value</tag> pair is rendered by its mapped component.
 * No grouping — pure 1:1 tag-to-component mapping.
 */

import React from 'react';
import { TextBlock, ThoughtBlock, DirProgressBlock, FileProgressBlock, ShellProgressBlock, InterruptBlock } from './tag-blocks';

export interface TagBlock {
    tag: string;
    text: string;
    done: boolean;
}

type TagComp = React.ComponentType<{ text: string; done?: boolean; isLast?: boolean }>;

const TAG_COMPONENTS: Record<string, TagComp> = {
    thought: ThoughtBlock,
    dir: DirProgressBlock,
    files: FileProgressBlock,
    shell: ShellProgressBlock,
    interrupt: InterruptBlock,
};

/**
 * Extract <tag>value</tag> pairs from raw XML text (with or without code fences).
 * Returns progressive — incomplete tags marked as done=false.
 */
export function extractTagBlocks(raw: string): TagBlock[] {
    let text = raw.trim().replace(/```(?:xml)?\s*\n?([\s\S]*?)```/i, '$1').trim();

    // Find all fully closed tags (supports attributes in opening tag)
    const closed: TagBlock[] = [];
    const closedRegex = /<([a-zA-Z_][\w.-]*)[^>]*>([\s\S]*?)<\/\1>/g;
    let m: RegExpExecArray | null;
    while ((m = closedRegex.exec(text)) !== null) {
        closed.push({ tag: m[1], text: m[2].trim(), done: true });
    }

    // Find open tag with optional attributes (started but not closed)
    const lastOpen = text.match(/<([a-zA-Z_][\w.-]*)[^>]*>([^<]*)$/);
    if (lastOpen && !closed.some(b => b.tag === lastOpen[1])) {
        closed.push({ tag: lastOpen[1], text: lastOpen[2].trim(), done: false });
    }

    return closed;
}

export function XmlTagRenderer({ content }: { content: string | string[] }) {
    const fullText = Array.isArray(content) ? content.join('') : content;
    const blocks = extractTagBlocks(fullText);

    // No XML tags found — render as plain text
    if (blocks.length === 0) {
        return <TextBlock text={fullText} />;
    }

    // Render each block with its mapped component
    return (
        <>
            {blocks.map((block, i) => {
                const Comp = TAG_COMPONENTS[block.tag];
                if (!Comp) {
                    return <TextBlock key={`tag-${i}`} text={block.text} />;
                }
                return (
                    <Comp
                        key={`tag-${i}`}
                        text={block.text}
                        done={block.done}
                        isLast={i === blocks.length - 1}
                    />
                );
            })}
        </>
    );
}
