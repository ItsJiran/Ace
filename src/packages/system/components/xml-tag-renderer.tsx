/**
 * XmlTagRenderer — renders raw XML buffer as per-tag blocks.
 *
 * Takes an array of string deltas (from ephemeral), joins them,
 * parses <tag>value</tag> pairs, and delegates to XmlTagAccordion
 * for rendering as a collapsible chain of styled block renderers.
 *
 * Open (incomplete) tags show a pulsing indicator and auto-expand the accordion.
 */
import React from 'react';
import { TextBlock } from './tag-blocks';
import { XmlTagAccordion } from './xml-tag-accordion';

export interface TagBlock {
    tag: string;
    text: string;
    done: boolean;
}

/**
 * Extract <tag>value</tag> pairs from raw XML text (with or without code fences).
 * Returns progressive — incomplete tags marked as done=false.
 */
export function extractTagBlocks(raw: string): TagBlock[] {
    let text = raw.trim().replace(/```(?:xml)?\s*\n?([\s\S]*?)```/i, '$1').trim();

    // Find all fully closed tags
    const closed: TagBlock[] = [];
    const closedRegex = /<([a-zA-Z_][\w.-]*)>([\s\S]*?)<\/\1>/g;
    let m: RegExpExecArray | null;
    while ((m = closedRegex.exec(text)) !== null) {
        closed.push({ tag: m[1], text: m[2].trim(), done: true });
    }

    // Find open tag (started but not closed)
    const lastOpen = text.match(/<([a-zA-Z_][\w.-]*)>([^<]*)$/);
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

    return <XmlTagAccordion blocks={blocks} />;
}
