/* eslint-disable react-refresh/only-export-components */

import type { AceRegistryType } from '#/schemas/registryTypes';
import { useAceMemory } from '#/hooks/useAceMemory';
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
            <div className="text-xs text-white/80 italic">
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
                <h3 key={idx} className="text-sm font-semibold text-zinc-900 dark:text-white/80 mt-2 first:mt-0">
                    {trimmed.replace(/^#+\s*/, '')}
                </h3>
            );
        }
        if (trimmed.startsWith('# ')) {
            return (
                <h2 key={idx} className="text-base font-bold text-zinc-900 dark:text-white/80 mt-3 first:mt-0">
                    {trimmed.replace(/^#+\s*/, '')}
                </h2>
            );
        }

        // Regular paragraph
        return (
            <p key={idx} className="text-sm text-white/80 dark:text-white/80 leading-relaxed whitespace-pre-wrap">
                {line}
            </p>
        );
    });

    const isStreaming = props.status === 'streaming';

    return (
        <div className={`rounded-xl border border-zinc-800/80 bg-black/15 p-3 min-h-12 ${isStreaming ? 'ring-1 ring-cyan-500/40' : ''}`}>
            <div className="flex items-start gap-2">
                <Type size={14} className={`text-white/80 mt-0.5 flex-shrink-0 ${isStreaming ? 'animate-pulse' : ''}`} />
                <div className="flex-1 min-w-0 space-y-1">
                    {lines}
                </div>
            </div>
        </div>
    );
}
