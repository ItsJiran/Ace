import { useState, useCallback } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import type { ToolManifestEntry } from '#/services/toolEngine';

export const registry: AceRegistryType.Component = {
    name: 'tool_runner_dev',
    slug: 'tool-runner-dev',
    react_behavior: 'tool_runner_dev',
};

interface ToolResult {
    status: 'idle' | 'running' | 'ok' | 'error';
    output: string;
}

export default function ToolRunnerDev() {
    const [tools, setTools] = useState<ToolManifestEntry[]>([]);
    const [loaded, setLoaded] = useState(false);

    const [selectedTool, setSelectedTool] = useState<ToolManifestEntry | null>(null);
    const [payloadText, setPayloadText] = useState('{}');
    const [result, setResult] = useState<ToolResult>({ status: 'idle', output: '' });

    const loadTools = useCallback(() => {
        const all = (window.ACE.tool as any).getAll() as ToolManifestEntry[];
        setTools(all);
        setLoaded(true);
        if (all.length > 0 && !selectedTool) {
            setSelectedTool(all[0]);
        }
    }, [selectedTool]);

    const onSelectTool = (slug: string) => {
        const t = tools.find(t => t.slug === slug) ?? null;
        setSelectedTool(t);
        setPayloadText('{}');
        setResult({ status: 'idle', output: '' });
    };

    const onRun = async () => {
        if (!selectedTool) return;
        let parsedPayload: unknown;
        try {
            parsedPayload = JSON.parse(payloadText);
        } catch {
            setResult({ status: 'error', output: 'Invalid JSON payload.' });
            return;
        }
        setResult({ status: 'running', output: '' });
        try {
            // Fire via EventBus so it goes through the standard execute_tool route
            window.ACE.event.emit({
                event_type: 'interaction',
                action: 'execute_tool',
                payload: {
                    package_ref: selectedTool.packageRef,
                    tool_slug: selectedTool.slug,
                    ...( typeof parsedPayload === 'object' && parsedPayload !== null ? parsedPayload : {} ),
                },
            });
            setResult({ status: 'ok', output: `Dispatched execute_tool → ${selectedTool.packageRef}/${selectedTool.slug}\nPayload: ${JSON.stringify(parsedPayload, null, 2)}` });
        } catch (err) {
            setResult({ status: 'error', output: String(err) });
        }
    };

    const onRunDirect = async () => {
        if (!selectedTool) return;
        let parsedPayload: unknown;
        try {
            parsedPayload = JSON.parse(payloadText);
        } catch {
            setResult({ status: 'error', output: 'Invalid JSON payload.' });
            return;
        }
        setResult({ status: 'running', output: 'Executing...' });
        try {
            const output = await (window.ACE.tool as any).execute(
                selectedTool.packageRef,
                selectedTool.slug,
                parsedPayload,
            );
            setResult({ status: 'ok', output: JSON.stringify(output, null, 2) });
        } catch (err) {
            setResult({ status: 'error', output: String(err) });
        }
    };

    const statusColor = {
        idle: 'text-zinc-400',
        running: 'text-yellow-400',
        ok: 'text-emerald-400',
        error: 'text-red-400',
    }[result.status];

    return (
        <div className="flex flex-col h-full bg-zinc-950 text-zinc-100 text-xs font-mono p-3 gap-3 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-zinc-300 font-semibold text-sm">Tool Runner</span>
                <button
                    className="ml-auto px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                    onClick={loadTools}
                >
                    {loaded ? `Reload (${tools.length})` : 'Load Tools'}
                </button>
            </div>

            {!loaded && (
                <div className="text-zinc-500 text-center py-6">Click "Load Tools" to fetch registered tools from registry.</div>
            )}

            {loaded && tools.length === 0 && (
                <div className="text-zinc-500 text-center py-6">No tools registered yet.</div>
            )}

            {loaded && tools.length > 0 && (
                <>
                    {/* Tool list */}
                    <div className="flex flex-col gap-1 max-h-36 overflow-y-auto flex-shrink-0">
                        {tools.map(t => (
                            <button
                                key={`${t.packageRef}:${t.slug}`}
                                onClick={() => onSelectTool(t.slug)}
                                className={`text-left px-2 py-1 rounded transition-colors ${
                                    selectedTool?.slug === t.slug
                                        ? 'bg-sky-900/50 text-sky-300 border border-sky-700'
                                        : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
                                }`}
                            >
                                <span className="text-zinc-500 mr-1">{t.packageRef}/</span>
                                <span className="font-semibold">{t.slug}</span>
                                {t.description && (
                                    <span className="ml-2 text-zinc-500 truncate">{t.description}</span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Selected tool detail */}
                    {selectedTool && (
                        <div className="flex flex-col gap-2 flex-1 min-h-0">
                            <div className="text-zinc-400">
                                <span className="text-sky-400">{selectedTool.slug}</span>
                                {' — '}
                                <span>{selectedTool.description}</span>
                            </div>

                            {/* Payload editor */}
                            <label className="text-zinc-500">Payload (JSON)</label>
                            <textarea
                                className="flex-1 min-h-[80px] bg-zinc-900 border border-zinc-700 rounded p-2 font-mono text-xs text-zinc-100 resize-none focus:outline-none focus:border-sky-600"
                                value={payloadText}
                                onChange={e => setPayloadText(e.target.value)}
                                spellCheck={false}
                            />

                            {/* Actions */}
                            <div className="flex gap-2 flex-shrink-0">
                                <button
                                    onClick={onRun}
                                    disabled={result.status === 'running'}
                                    className="px-3 py-1 rounded bg-sky-800 hover:bg-sky-700 text-sky-100 disabled:opacity-50 transition-colors"
                                >
                                    Via EventBus
                                </button>
                                <button
                                    onClick={onRunDirect}
                                    disabled={result.status === 'running'}
                                    className="px-3 py-1 rounded bg-violet-800 hover:bg-violet-700 text-violet-100 disabled:opacity-50 transition-colors"
                                >
                                    Direct Execute
                                </button>
                                <span className={`ml-auto self-center font-semibold ${statusColor}`}>
                                    {result.status.toUpperCase()}
                                </span>
                            </div>

                            {/* Result */}
                            {result.output && (
                                <pre className="bg-zinc-900 border border-zinc-800 rounded p-2 text-xs overflow-auto max-h-40 text-zinc-200 flex-shrink-0">
                                    {result.output}
                                </pre>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
