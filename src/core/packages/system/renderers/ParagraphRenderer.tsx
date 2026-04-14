import type { AceRegistryType } from '#/schemas/registryTypes';
import { useAceMemory } from '#/hooks/useAceMemory';
import { Type } from 'lucide-react';

export const registry: AceRegistryType.Renderer = {
    name: 'Paragraph Renderer',
    slug: 'paragraph-renderer',
    description: 'Renders plain text and prose content with markdown-like formatting',
    react_behavior: 'paragraph_renderer',
    input_types: ['paragraph', 'text', 'prose'],
    supported_formats: ['markdown', 'card', 'list'],
};

interface ParagraphRendererProps {
    memory_uid?: string;
    text?: string;
    content?: string;
    markdown?: string;
    value?: string;
    [key: string]: unknown;
}

export default function ParagraphRenderer(props: ParagraphRendererProps) {
    const streamedText = useAceMemory<string>(typeof props.memory_uid === 'string' ? props.memory_uid : '');
    const text = streamedText || props.text || props.content || props.markdown || props.value || '';

    if (!text || typeof text !== 'string') {
        return (
            <div className="text-xs text-zinc-500 italic">
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
                <h3 key={idx} className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-2 first:mt-0">
                    {trimmed.replace(/^#+\s*/, '')}
                </h3>
            );
        }
        if (trimmed.startsWith('# ')) {
            return (
                <h2 key={idx} className="text-base font-bold text-zinc-900 dark:text-zinc-100 mt-3 first:mt-0">
                    {trimmed.replace(/^#+\s*/, '')}
                </h2>
            );
        }

        // Regular paragraph
        return (
            <p key={idx} className="text-sm text-zinc-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
                {line}
            </p>
        );
    });

    const isStreaming = props.__status === 'streaming';

    return (
        <div className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 min-h-12 ${isStreaming ? 'ring-1 ring-cyan-500/50' : ''}`}>
            <div className="flex items-start gap-2">
                <Type size={14} className={`text-zinc-500 dark:text-zinc-400 mt-0.5 flex-shrink-0 ${isStreaming ? 'animate-pulse text-cyan-400' : ''}`} />
                <div className="flex-1 min-w-0 space-y-1">
                    {lines}
                </div>
            </div>
        </div>
    );
}
