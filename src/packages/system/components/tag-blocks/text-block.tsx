/**
 * TextBlock — renders plain/regular text content (non-XML or <reply>).
 *
 * Uses theme CSS variables for color — syncs with light/dark/system themes.
 */
import React from 'react';

export interface TextBlockProps {
    text: string;
}

export function TextBlock({ text }: TextBlockProps) {
    if (!text) {
        return (
            <div
                className="text-sm italic"
                style={{ color: 'var(--ace-chat-label-text)' }}
            >
                ...
            </div>
        );
    }

    return (
        <div
            className="text-sm leading-relaxed whitespace-pre-wrap"
            style={{ color: 'var(--ace-container-first-text)' }}
        >
            {text}
        </div>
    );
}
