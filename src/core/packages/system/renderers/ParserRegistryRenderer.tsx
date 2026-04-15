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

    let icon = <DatabaseZap size={14} className="text-zinc-500" />;
    let message = "Loading parser registry data...";

    if (action === 'list' || action === 'list_names') {
        icon = <Search size={14} className="text-blue-500" />;
        message = `Loaded ${count || names.length || 0} registered parser block names from the registry.`;
    } else if (action === 'list_hydrated') {
        icon = <Blocks size={14} className="text-cyan-500" />;
        message = `Loaded ${count || names.length || 0} hydrated parser block names currently injected into the prompt.`;
    } else if (action === 'detail') {
        icon = <Search size={14} className="text-purple-500" />;
        message = `Inspected details of block \`${target_slug}\` into Working Memory.`;
    } else if (action === 'activate') {
        icon = <CheckCircle2 size={14} className="text-green-500" />;
        message = `Activated block \`${target_slug}\`. Its instructions are now included in the prompt.`;
    } else if (action === 'deactivate') {
        icon = <XCircle size={14} className="text-orange-500" />;
        message = `Deactivated block \`${target_slug}\` from the prompt.`;
    }

    const visibleCount = count || names.length || sections.length;

    return (
        <div className={`rounded-2xl border border-zinc-200 bg-gradient-to-br from-white via-zinc-50 to-slate-100 p-4 shadow-sm dark:border-zinc-700 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-800 ${isStreaming ? 'animate-pulse' : ''} flex flex-col gap-3`}>
            <div className="flex items-start gap-3">
                <div className="rounded-xl border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
                    {icon}
                </div>
                <div className="flex-1 w-0">
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                        {message}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-white dark:bg-zinc-100 dark:text-zinc-900">
                            {action ?? 'pending'}
                        </span>
                        {visibleCount > 0 && (
                            <span className="rounded-full border border-zinc-300 px-2.5 py-1 text-zinc-600 dark:border-zinc-600 dark:text-zinc-300">
                                {visibleCount} blocks
                            </span>
                        )}
                        {target_slug && (
                            <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                                {target_slug}
                            </span>
                        )}
                    </div>
                </div>
                {sections.length > 0 && (
                    <button 
                        onClick={() => setExpanded(!expanded)} 
                        className="rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                        title={expanded ? "Hide Details" : "Show Details"}
                    >
                        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                )}
            </div>

            {sections.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {sections.map((section) => (
                        <div key={section.slug} className="rounded-xl border border-zinc-200/80 bg-white/80 p-3 dark:border-zinc-700/80 dark:bg-zinc-900/70">
                            <div className="flex items-center gap-2">
                                <Blocks size={14} className="text-sky-500" />
                                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                                    {section.slug}
                                </p>
                            </div>
                            {section.purpose && (
                                <p className="mt-2 line-clamp-3 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                                    {section.purpose}
                                </p>
                            )}
                            <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                                {section.whenToUse.length > 0 && (
                                    <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                                        {section.whenToUse.length} uses
                                    </span>
                                )}
                                {section.promptExamples.length > 0 && (
                                    <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                                        {section.promptExamples.length} prompts
                                    </span>
                                )}
                                {section.exampleLines.length > 0 && (
                                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
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
                        <span key={name} className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-200">
                            {name}
                        </span>
                    ))}
                </div>
            )}
            
            {sections.length > 0 && expanded && (
                <div className="grid gap-3">
                    {sections.map((section) => (
                        <div key={`${section.slug}-detail`} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950/80">
                            <div className="flex items-center gap-2">
                                <DatabaseZap size={15} className="text-violet-500" />
                                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                    {section.slug}
                                </h3>
                            </div>

                            {section.purpose && (
                                <p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                                    {section.purpose}
                                </p>
                            )}

                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                                {section.requiredFields && (
                                    <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                                        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                            <BookOpen size={13} />
                                            Required
                                        </div>
                                        <p className="text-xs leading-5 text-zinc-700 dark:text-zinc-300">{section.requiredFields}</p>
                                    </div>
                                )}

                                {section.optionalFields && (
                                    <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
                                        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                                            <Sparkles size={13} />
                                            Optional
                                        </div>
                                        <p className="text-xs leading-5 text-zinc-700 dark:text-zinc-300">{section.optionalFields}</p>
                                    </div>
                                )}
                            </div>

                            {section.whenToUse.length > 0 && (
                                <div className="mt-4">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">When to use</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {section.whenToUse.map((item) => (
                                            <span key={item} className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs leading-5 text-sky-800 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-200">
                                                {item}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {section.promptExamples.length > 0 && (
                                <div className="mt-4">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Prompt examples</p>
                                    <div className="mt-2 grid gap-2">
                                        {section.promptExamples.map((item) => (
                                            <div key={item} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                                                {item}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {section.exampleLines.length > 0 && (
                                <div className="mt-4 overflow-auto rounded-lg border border-zinc-200 bg-zinc-950 p-3 dark:border-zinc-800">
                                    <pre className="text-xs leading-6 text-zinc-200 whitespace-pre-wrap">
                                        {section.exampleLines.join('\n').trim()}
                                    </pre>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {data && sections.length === 0 && expanded && (
                <div className="rounded-lg border border-zinc-200 bg-zinc-950 p-3 dark:border-zinc-800">
                    <pre className="text-xs leading-6 text-zinc-200 whitespace-pre-wrap">
                        {data
                            .split(/\r?\n/)
                            .filter((line) => line.trim() !== '@@ace:end')
                            .join('\n')}
                    </pre>
                </div>
            )}
        </div>
    );
}
