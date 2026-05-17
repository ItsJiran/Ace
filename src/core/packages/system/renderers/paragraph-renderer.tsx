/* eslint-disable react-refresh/only-export-components */

import type { AceRegistryType } from '#/schemas/registry-types';
import { useAceMemory } from '#/hooks/use-ace-memory';
import { Type } from 'lucide-react';

export const registry: AceRegistryType.Renderer = {
    name: 'Paragraph Renderer',
    slug: 'paragraph_renderer',
    description: 'Renders plain text and prose content with markdown-like formatting',
};

interface ParagraphRendererProps {
    payload?: {
        memory_uid?: string;
        text?: string;
        content?: string;
        markdown?: string;
        value?: string;
        [key: string]: unknown;
    };
    status?: string;
    [key: string]: unknown;
}

export default function ParagraphRenderer(props: ParagraphRendererProps) {
    const payload = props.payload ?? {};
    const memoryUid = typeof payload.memory_uid === 'string' ? payload.memory_uid : '';
    const streamedText = useAceMemory<string>(memoryUid);
    const text = streamedText ?? payload.text ?? payload.content ?? payload.markdown ?? payload.value ?? '';

    if (!text || typeof text !== 'string') {
        return (
            <div className="system-chat-inline-empty">
                (empty content)
            </div>
        );
    }

    // Simple markdown-like formatting
    const lines = text.split('\n').map((line, idx) => {
        const trimmed = line.trim();

        // Check for heading
        if (trimmed.startsWith('##')) {
            return (
                <h3 key={idx} className="system-chat-paragraph-subheading">
                    {trimmed.replace(/^#+\s*/, '')}
                </h3>
            );
        }
        if (trimmed.startsWith('# ')) {
            return (
                <h2 key={idx} className="system-chat-paragraph-heading">
                    {trimmed.replace(/^#+\s*/, '')}
                </h2>
            );
        }

        // Regular paragraph
        return (
            <p key={idx} className="opacity-80">
                {line}
            </p>
        );
    });

    const isStreaming = props.status === 'streaming';

    return (
        <div className={`system-chat-paragraph-block ${isStreaming ? 'is-streaming' : ''}`}>
            <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0 space-y-1">
                    {lines}
                </div>
            </div>
        </div>
    );
}
