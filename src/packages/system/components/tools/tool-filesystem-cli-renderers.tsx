import { CheckCircle2, FileCode2, FolderTree, Search, TerminalSquare, TextSearch } from 'lucide-react';
import { motion } from 'framer-motion';

import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';
import { MetaGrid, StructuredValueBlock, ToolSection } from './tool-renderer-shared';
import { asRecord, normalizename, parseStructuredValue } from './tool-renderer.utils';
import type { ToolRendererProps } from './tool-renderer.utils';

function resolveToolTextContent(value: unknown) {
    const normalizedValue = parseStructuredValue(value);
    if (typeof normalizedValue === 'string') {
        return normalizedValue;
    }

    if (Array.isArray(normalizedValue)) {
        const textParts = normalizedValue
            .map((item) => asRecord(item))
            .filter((item): item is Record<string, unknown> => Boolean(item))
            .flatMap((item) => {
                if (typeof item.text === 'string') {
                    return [item.text];
                }

                return [] as string[];
            });

        return textParts.length > 0 ? textParts.join('\n\n') : null;
    }

    const record = asRecord(normalizedValue);
    if (record && typeof record.text === 'string') {
        return record.text;
    }

    return null;
}

function renderStatusMessage(
    title: string,
    body: string,
    meta?: Array<{ label: string; value: string | null }>,
) {
    return (
        <div className="flex flex-col gap-3">
            <div className="rounded-[18px] border border-white/10 bg-black/15 p-3">
                <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                    <CheckCircle2 size={13} />
                    <span>{title}</span>
                </div>
                {meta ? <MetaGrid items={meta} /> : null}
                <div className="mt-3 whitespace-pre-wrap break-words text-sm text-zinc-200">
                    {body}
                </div>
            </div>
        </div>
    );
}

function ToolLsRenderer(props: ToolRendererProps) {
    const { targets } = useAceTheme();
    const textContent = resolveToolTextContent(props.content) ?? '';
    const lines = textContent
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    const entries = lines
        .filter((line) => !/^No files found/i.test(line) && !/^Error listing files/i.test(line))
        .map((line) => {
            const directoryMatch = line.match(/^(.*) \(directory\)$/);
            if (directoryMatch) {
                return { path: directoryMatch[1], kind: 'directory', size: null };
            }

            const fileMatch = line.match(/^(.*?)(?: \((\d+) bytes\))?$/);
            return {
                path: fileMatch?.[1] ?? line,
                kind: 'file',
                size: fileMatch?.[2] ? `${fileMatch[2]} bytes` : null,
            };
        });

    return (
        <div className="flex flex-col gap-3">
            {textContent && entries.length === 0 ? (
                <ToolSection title="Listing Status" icon={FolderTree} value={textContent} />
            ) : null}

            {entries.length > 0 ? (
                <>
                    <div className="border-t border-stone-500/40 my-2"></div>
                    <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                        <FolderTree size={13} />
                        <span>Directory Listing</span>
                    </div>
                    <div className="flex flex-col gap-2 overflow-auto">
                        {entries.map((entry) => (
                            <div
                                key={`${entry.path}-${entry.kind}`}
                                className={[targets.container.first, 'rounded-2xl px-3 py-2'].join(' ')}
                            >
                                {entry.kind === 'directory' ? (
                                    <div className="flex items-center gap-2">
                                        <div className={targets.btn.secondary}>
                                            <FolderTree size={13} />
                                        </div>
                                        <span>{entry.path}</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <div className={targets.btn.first}>
                                            <FileCode2 size={13} />
                                        </div>
                                        <span>{entry.path}</span>
                                        {entry.size ? (
                                            <span className="text-xst text-zinc-400">
                                                ({entry.size})
                                            </span>
                                        ) : null}
                                    </div>
                                )}
                                {/* <MetaGrid
									items={[
										{ label: 'Path', value: entry.path },
										{ label: 'Kind', value: entry.kind },
										{ label: 'Size', value: entry.size },
									]}
								/> */}
                            </div>
                        ))}
                    </div>
                </>
            ) : null}
            <div className="border-t border-stone-500/40 my-2"></div>
        </div>
    );
}

function ToolGlobRenderer(props: ToolRendererProps) {
    const textContent = resolveToolTextContent(props.content) ?? '';
    const paths = textContent
        .split('\n')
        .map((line) => line.trim())
        .filter(
            (line) =>
                Boolean(line) &&
                !/^No files found/i.test(line) &&
                !/^Error finding files/i.test(line),
        );

    return (
        <div className="flex flex-col gap-3">
            <MetaGrid
                items={[
                    { label: 'Tool', value: props.name },
                    { label: 'Match Count', value: paths.length ? String(paths.length) : null },
                ]}
            />

            {textContent && paths.length === 0 ? (
                <ToolSection title="Glob Status" icon={Search} value={textContent} />
            ) : null}

            {paths.length > 0 ? (
                <div className="rounded-[18px] border border-white/10 bg-black/15 p-3">
                    <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                        <Search size={13} />
                        <span>Glob Matches</span>
                    </div>
                    <div className="flex flex-col gap-2">
                        {paths.map((path) => (
                            <div
                                key={path}
                                className="rounded-2xl border border-white/10 bg-zinc-950/75 px-3 py-2 font-mono text-[11px] text-zinc-300"
                            >
                                {path}
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function ToolGrepRenderer(props: ToolRendererProps) {
    const textContent = resolveToolTextContent(props.content) ?? '';
    const sections = new Map<string, Array<{ line: string; text: string }>>();
    let currentFile: string | null = null;

    for (const rawLine of textContent.split('\n')) {
        const line = rawLine.replace(/\r$/, '');
        if (!line.trim()) {
            continue;
        }

        if (!line.startsWith(' ') && line.endsWith(':')) {
            currentFile = line.slice(0, -1);
            if (!sections.has(currentFile)) {
                sections.set(currentFile, []);
            }
            continue;
        }

        const match = line.match(/^\s*(\d+):\s?(.*)$/);
        if (currentFile && match) {
            sections.get(currentFile)?.push({ line: match[1], text: match[2] });
        }
    }

    const matchCount = Array.from(sections.values()).reduce(
        (total, value) => total + value.length,
        0,
    );

    return (
        <div className="flex flex-col gap-3">
            <MetaGrid
                items={[
                    { label: 'Tool', value: props.name },
                    { label: 'Files', value: sections.size ? String(sections.size) : null },
                    { label: 'Matches', value: matchCount ? String(matchCount) : null },
                ]}
            />

            {textContent && sections.size === 0 ? (
                <ToolSection title="Search Status" icon={TextSearch} value={textContent} />
            ) : null}

            {sections.size > 0 ? (
                <div className="rounded-[18px] border border-white/10 bg-black/15 p-3">
                    <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                        <TextSearch size={13} />
                        <span>Grep Matches</span>
                    </div>
                    <div className="flex flex-col gap-3">
                        {Array.from(sections.entries()).map(([filePath, matches]) => (
                            <div
                                key={filePath}
                                className="rounded-2xl border border-white/10 bg-zinc-950/75 p-3"
                            >
                                <div className="mb-3 font-mono text-[11px] text-zinc-400">
                                    {filePath}
                                </div>
                                <div className="flex flex-col gap-2">
                                    {matches.map((match) => (
                                        <div
                                            key={`${filePath}:${match.line}`}
                                            className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                                        >
                                            <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                                                line {match.line}
                                            </div>
                                            <div className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-200">
                                                {match.text}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function ToolReadFileRenderer(props: ToolRendererProps) {
    const textContent = resolveToolTextContent(props.content);
    const normalizedContent = parseStructuredValue(props.content);
    const binaryParts = Array.isArray(normalizedContent)
        ? normalizedContent
              .map((item) => asRecord(item))
              .filter((item): item is Record<string, unknown> => {
                  if (!item) {
                      return false;
                  }

                  return typeof item.type === 'string' && item.type !== 'text';
              })
        : [];

    return (
        <>
        <div className="flex flex-col gap-3">
                    <div className="border-t border-stone-500/40 my-2"></div>
            {textContent ? (
                <ToolSection title="File Content" icon={FileCode2} value={textContent} />
            ) : null}

            {binaryParts.length > 0 ? (
                <>
                        <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                            <FileCode2 size={13} />
                            <span>Binary Payload</span>
                        </div>
                        <div className="flex flex-col gap-2">
                            {binaryParts.map((part, index) => (
                                <div
                                    key={`${String(part.type)}-${index}`}
                                    className="rounded-2xl border border-white/10 bg-zinc-950/75 px-3 py-2"
                                >
                                    <StructuredValueBlock value={part} />
                                </div>
                            ))}
                        </div>
                </>
            ) : null}
        </div>
        <div className="border-t border-stone-500/40 my-2"></div>
        </>
    );
}

function ToolWriteFileRenderer(props: ToolRendererProps) {
    const textContent = resolveToolTextContent(props.content) ?? '';
    const match = textContent.match(/Successfully wrote to '(.+)'/);
    return renderStatusMessage('Write File Result', textContent, [
        { label: 'Tool', value: props.name },
        { label: 'Path', value: match?.[1] ?? null },
    ]);
}

function ToolEditFileRenderer(props: ToolRendererProps) {
    const textContent = resolveToolTextContent(props.content) ?? '';
    const match = textContent.match(/Successfully replaced (\d+) occurrence\(s\) in '(.+)'/);
    return renderStatusMessage('Edit File Result', textContent, [
        { label: 'Tool', value: props.name },
        { label: 'Occurrences', value: match?.[1] ?? null },
        { label: 'Path', value: match?.[2] ?? null },
    ]);
}

function ToolExecuteRenderer(props: ToolRendererProps) {
    const textContent = resolveToolTextContent(props.content) ?? '';
    const sections = textContent.split(/\n\n+/).map((section) => section.trim()).filter(Boolean);
    const cwdLine = sections.find((section) => section.startsWith('cwd: ')) ?? null;
    const commandLine = sections.find((section) => section.startsWith('$ ')) ?? null;
    const stdoutSection = sections.find((section) => section.startsWith('stdout:')) ?? null;
    const stderrSection = sections.find((section) => section.startsWith('stderr:')) ?? null;
    const fallbackBody = sections
        .filter((section) => section !== cwdLine && section !== commandLine && section !== stdoutSection && section !== stderrSection)
        .join('\n\n');


    // const status = stderrSection ? 'error' : 'success';
    const stdoutBody = stdoutSection?.replace(/^stdout:\n?/, '') ?? '';
    const stderrBody = stderrSection?.replace(/^stderr:\n?/, '') ?? '';

    return (
        <div className="flex flex-col gap-3">

            {commandLine ? (
                <div className="rounded-[18px] p-3">
                    <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
                        <TerminalSquare size={13} />
                        <span>Command</span>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-zinc-950/75 px-3 py-2 font-mono text-[11px] text-zinc-300">
                        {commandLine.replace(/^\$\s*/, '')}
                    </div>
                </div>
            ) : null}

            {stdoutBody ? (
                <ToolSection title="Stdout" icon={TerminalSquare} value={stdoutBody} />
            ) : null}

            {stderrBody ? (
                <ToolSection title="Stderr" icon={TerminalSquare} value={stderrBody} />
            ) : null}

            {!stdoutBody && !stderrBody && fallbackBody ? (
                <ToolSection title="Execute Result" icon={TerminalSquare} value={fallbackBody} />
            ) : null}
        </div>
    );
}

export function ToolFilesystemCliRenderer(props: ToolRendererProps) {
    const normalizedname = normalizename(props.name);

    let content: React.ReactNode = null;

    if (normalizedname === 'ls') {
        content = <ToolLsRenderer {...props} />;
    } else if (normalizedname === 'glob') {
        content = <ToolGlobRenderer {...props} />;
    } else if (normalizedname === 'grep') {
        content = <ToolGrepRenderer {...props} />;
    } else if (normalizedname === 'read_file') {
        content = <ToolReadFileRenderer {...props} />;
    } else if (normalizedname === 'write_file') {
        content = <ToolWriteFileRenderer {...props} />;
    } else if (normalizedname === 'edit_file') {
        content = <ToolEditFileRenderer {...props} />;
    } else if (normalizedname === 'execute' || normalizedname === 'move') {
        content = <ToolExecuteRenderer {...props} />;
    }

    if (!content) return null;

    return (
        <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            style={{ overflow: 'hidden' }}
        >
            {content}
        </motion.div>
    );
}
