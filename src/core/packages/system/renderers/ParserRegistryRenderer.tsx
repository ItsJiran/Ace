import { useState } from 'react';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { DatabaseZap, CheckCircle2, XCircle, Search, ChevronDown, ChevronRight } from 'lucide-react';

export const registry: AceRegistryType.Renderer = {
    name: 'Parser Registry Renderer',
    slug: 'parser-registry-renderer',
    description: 'Displays actions taken involving the Parser Registry',
    react_behavior: 'parser_registry_renderer',
    input_types: ['parser_registry'],
    supported_formats: ['card'],
};

interface ParserRegistryRendererProps {
    action?: 'list' | 'detail' | 'activate' | 'deactivate';
    count?: number;
    target_slug?: string;
    data?: string;
    __status?: 'streaming' | 'completed';
    [key: string]: unknown;
}

export default function ParserRegistryRenderer(props: ParserRegistryRendererProps) {
    const { action, count, target_slug, data, __status } = props;
    const isStreaming = __status === 'streaming';
    const [expanded, setExpanded] = useState(false);

    let icon = <DatabaseZap size={14} className="text-zinc-500" />;
    let message = "Loading parser registry data...";

    if (action === 'list') {
        icon = <Search size={14} className="text-blue-500" />;
        message = `Loaded details of ${count || 0} available parser blocks to Working Memory.`;
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

    return (
        <div className={`bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/50 rounded-lg p-3 ${isStreaming ? 'animate-pulse' : ''} flex flex-col gap-2`}>
            <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-md bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 shadow-sm`}>
                    {icon}
                </div>
                <div className="flex-1 w-0">
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">
                        {message}
                    </p>
                </div>
                {data && (
                    <button 
                        onClick={() => setExpanded(!expanded)} 
                        className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-700"
                        title={expanded ? "Hide Details" : "Show Details"}
                    >
                        {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                )}
            </div>
            
            {data && expanded && (
                <div className="mt-2 bg-zinc-900 dark:bg-black rounded-md p-3 overflow-auto max-h-64 border border-zinc-200 dark:border-zinc-800">
                    <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap leading-relaxed">
                        {data}
                    </pre>
                </div>
            )}
        </div>
    );
}
