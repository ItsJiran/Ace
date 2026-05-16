import { useState } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { DatabaseZap, CheckCircle2, XCircle, Search, ChevronDown, ChevronRight, Blocks, BookOpen, Sparkles } from 'lucide-react';

export const registry: AceRegistryType.Renderer = {
    name: 'Parser Registry Renderer',
    slug: 'parser_registry_renderer',
    description: 'Displays actions taken involving the Parser Registry',
};

interface ParserRegistryRendererPayload {
    action?: 'list' | 'list_names' | 'list_hydrated' | 'detail' | 'activate' | 'deactivate';
    count?: number;
    target_slug?: string;
    data?: string;
    names?: string[];
    [key: string]: unknown;
}

interface ParserRegistryRendererProps {
    payload?: ParserRegistryRendererPayload;
    status?: 'streaming' | 'completed';
    action?: 'list' | 'list_names' | 'list_hydrated' | 'detail' | 'activate' | 'deactivate';
    count?: number;
    target_slug?: string;
    data?: string;
    names?: string[];
    __status?: 'streaming' | 'completed';
}

interface ParsedRegistrySection {
    slug: string;
    purpose?: string;
    requiredFields?: string;
    optionalFields?: string;
    whenToUse: string[];
    promptExamples: string[];
    exampleLines: string[];
}

function sanitizeExampleLines(lines: string[]): string[] {
    return lines
        .filter((line) => line.trim() !== '@@ace:end')
        .map((line) => line.replace(/^  /, ''));
}

function parseRegistryData(data?: string): ParsedRegistrySection[] {
    if (!data) return [];

    const normalized = data.replace(/\r\n/g, '\n');
    const sectionMatches = normalized.split(/\n(?=--- <[^>]+> ---)/g);

    return sectionMatches
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .map((chunk) => {
            const lines = chunk.split('\n');
            const header = lines.shift() ?? '';
            const slugMatch = header.match(/^--- <([^>]+)> ---$/);
            const section: ParsedRegistrySection = {
                slug: slugMatch?.[1] ?? 'unknown',
                whenToUse: [],
                promptExamples: [],
                exampleLines: [],
            };

            let currentList: 'whenToUse' | 'promptExamples' | 'exampleLines' | null = null;

            for (const rawLine of lines) {
                const line = rawLine.trimEnd();
                const trimmed = line.trim();

                if (trimmed === '') {
                    if (currentList === 'exampleLines') {
                        section.exampleLines.push('');
                    }
                    continue;
                }

                if (trimmed.startsWith('Purpose: ')) {
                    section.purpose = trimmed.slice('Purpose: '.length);
                    currentList = null;
                    continue;
                }

                if (trimmed.startsWith('Required fields: ')) {
                    section.requiredFields = trimmed.slice('Required fields: '.length);
                    currentList = null;
                    continue;
                }

                if (trimmed.startsWith('Optional fields: ')) {
                    section.optionalFields = trimmed.slice('Optional fields: '.length);
                    currentList = null;
                    continue;
                }

                if (trimmed === 'When to use:') {
                    currentList = 'whenToUse';
                    continue;
                }

                if (trimmed === 'Prompt examples:') {
                    currentList = 'promptExamples';
                    continue;
                }

                if (trimmed === 'Example:') {
                    currentList = 'exampleLines';
                    continue;
                }

                if (currentList === 'whenToUse' && trimmed.startsWith('• ')) {
                    section.whenToUse.push(trimmed.slice(2));
                    continue;
                }

                if (currentList === 'promptExamples' && trimmed.startsWith('• ')) {
                    section.promptExamples.push(trimmed.slice(2).replace(/^"|"$/g, ''));
                    continue;
                }

                if (currentList === 'exampleLines') {
                    section.exampleLines.push(line);
                }
            }

            section.exampleLines = sanitizeExampleLines(section.exampleLines);
            return section;
        });
}

export default function ParserRegistryRenderer(props: ParserRegistryRendererProps) {
    const payload = props.payload ?? props;
    const action = payload.action;
    const count = payload.count;
    const target_slug = payload.target_slug;
    const data = payload.data;
    const names = Array.isArray(payload.names)
        ? payload.names.filter((item: unknown): item is string => typeof item === 'string')
        : [];
    const isStreaming = (props.status ?? props.__status) === 'streaming';
    const [expanded, setExpanded] = useState(false);
    const sections = parseRegistryData(data);

    let icon = <DatabaseZap size={14} className="system-chat-icon-muted" />;
    let message = "Loading parser registry data...";

    if (action === 'list' || action === 'list_names') {
        icon = <Search size={14} className="system-chat-tone-info" />;
        message = `Loaded ${count || names.length || 0} registered parser block names from the registry.`;
    } else if (action === 'list_hydrated') {
        icon = <Blocks size={14} className="system-chat-tone-info" />;
        message = `Loaded ${count || names.length || 0} hydrated parser block names currently injected into the prompt.`;
    } else if (action === 'detail') {
        icon = <Search size={14} className="system-chat-tone-active" />;
        message = `Inspected details of block \`${target_slug}\` into Working Memory.`;
    } else if (action === 'activate') {
        icon = <CheckCircle2 size={14} className="system-chat-tone-success" />;
        message = `Activated block \`${target_slug}\`. Its instructions are now included in the prompt.`;
    } else if (action === 'deactivate') {
        icon = <XCircle size={14} className="system-chat-tone-error" />;
        message = `Deactivated block \`${target_slug}\` from the prompt.`;
    }

    const visibleCount = count || names.length || sections.length;

    return (
        <div className={`system-chat-renderer-surface flex flex-col gap-3 p-3 ${isStreaming ? 'animate-pulse' : ''}`}>
            <div className="flex items-start gap-3">
                <div className="system-chat-renderer-panel mt-0.5 flex-shrink-0 p-2">
                    {icon}
                </div>
                <div className="w-0 flex-1">
                    <p className="system-chat-copy-strong text-sm font-medium">
                        {message}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <span className="system-chat-tone-pill system-chat-label-muted">
                            {action ?? 'pending'}
                        </span>
                        {visibleCount > 0 && (
                            <span className="system-chat-count-pill px-2.5 py-1 text-xs">
                                {visibleCount} blocks
                            </span>
                        )}
                        {target_slug && (
                            <span className="system-chat-tone-pill system-chat-tone-success">
                                {target_slug}
                            </span>
                        )}
                    </div>
                </div>
                {sections.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setExpanded(!expanded)}
                        className="system-chat-subtle-action mt-0.5 flex-shrink-0 p-1.5"
                        title={expanded ? 'Hide Details' : 'Show Details'}
                    >
                        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                )}
            </div>

            {sections.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {sections.map((section) => (
                        <div key={section.slug} className="system-chat-renderer-panel flex flex-col gap-2 p-3">
                            <div className="flex items-center gap-2">
                                <Blocks size={14} className="system-chat-tone-info flex-shrink-0" />
                                <p className="system-chat-copy-strong text-[12px] font-semibold">
                                    {section.slug}
                                </p>
                            </div>
                            {section.purpose && (
                                <p className="system-chat-copy-muted line-clamp-3 text-[11px] leading-5">
                                    {section.purpose}
                                </p>
                            )}
                            <div className="flex flex-wrap gap-1.5">
                                {section.whenToUse.length > 0 && (
                                    <span className="system-chat-count-pill px-2 py-0.5 text-[10px]">
                                        {section.whenToUse.length} uses
                                    </span>
                                )}
                                {section.promptExamples.length > 0 && (
                                    <span className="system-chat-count-pill px-2 py-0.5 text-[10px]">
                                        {section.promptExamples.length} prompts
                                    </span>
                                )}
                                {section.exampleLines.length > 0 && (
                                    <span className="system-chat-tone-pill system-chat-tone-success px-2 py-0.5 text-[10px]">
                                        example ready
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {names.length > 0 && sections.length === 0 && (
                <div className="flex flex-wrap gap-2">
                    {names.map((name: string) => (
                        <span key={name} className="system-chat-count-pill px-2.5 py-1 text-xs">
                            {name}
                        </span>
                    ))}
                </div>
            )}
            
            {sections.length > 0 && expanded && (
                <div className="grid gap-3">
                    {sections.map((section) => (
                        <div key={`${section.slug}-detail`} className="system-chat-renderer-panel flex flex-col gap-3 p-3">
                            <div className="flex items-center gap-2">
                                <DatabaseZap size={15} className="system-chat-tone-active flex-shrink-0" />
                                <h3 className="system-chat-copy-strong text-[12px] font-semibold">
                                    {section.slug}
                                </h3>
                            </div>

                            {section.purpose && (
                                <p className="system-chat-renderer-body p-0 text-xs leading-6">
                                    {section.purpose}
                                </p>
                            )}

                            <div className="grid gap-2 md:grid-cols-2">
                                {section.requiredFields && (
                                    <div className="system-chat-renderer-panel p-2">
                                        <div className="system-chat-label-muted mb-1 flex items-center gap-1 text-[10px] tracking-wide">
                                            <BookOpen size={12} />
                                            Required
                                        </div>
                                        <p className="system-chat-preview-copy leading-5">{section.requiredFields}</p>
                                    </div>
                                )}

                                {section.optionalFields && (
                                    <div className="system-chat-renderer-panel p-2">
                                        <div className="system-chat-label-muted mb-1 flex items-center gap-1 text-[10px] tracking-wide">
                                            <Sparkles size={12} />
                                            Optional
                                        </div>
                                        <p className="system-chat-preview-copy leading-5">{section.optionalFields}</p>
                                    </div>
                                )}
                            </div>

                            {section.whenToUse.length > 0 && (
                                <div>
                                    <p className="system-chat-label-muted mb-2 text-[10px] tracking-wide">When to use</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {section.whenToUse.map((item) => (
                                            <span key={item} className="system-chat-count-pill px-2.5 py-1 text-[11px] leading-5">
                                                {item}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {section.promptExamples.length > 0 && (
                                <div>
                                    <p className="system-chat-label-muted mb-2 text-[10px] tracking-wide">Prompt examples</p>
                                    <div className="grid gap-1.5">
                                        {section.promptExamples.map((item) => (
                                            <div key={item} className="system-chat-renderer-panel px-2.5 py-2 text-[11px] leading-5">
                                                {item}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {section.exampleLines.length > 0 && (
                                <pre className="system-chat-code-block max-h-48 leading-6">
                                    {section.exampleLines.join('\n').trim()}
                                </pre>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {data && sections.length === 0 && expanded && (
                <pre className="system-chat-code-block max-h-64 leading-6">
                    {data
                        .split(/\r?\n/)
                        .filter((line) => line.trim() !== '@@ace:end')
                        .join('\n')}
                </pre>
            )}
        </div>
    );
}
