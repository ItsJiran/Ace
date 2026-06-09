/**
 * TextBlock — renders plain/regular text content (non-XML or <reply>).
 *
 * Used as the fallback renderer when no recognized tag is found,
 * and also for the raw reply text from action_speak.
 */
import React from 'react';

export interface TextBlockProps {
    text: string;
}

export function TextBlock({ text }: TextBlockProps) {
    if (!text) return <div className="text-zinc-500 italic text-sm">...</div>;

    return (
        <div className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
            {text}
        </div>
    );
}
