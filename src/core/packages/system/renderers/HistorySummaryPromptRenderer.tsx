import type { AceRegistryType } from '#/schemas/registryTypes';
import { MessageCircle } from 'lucide-react';

export const registry: AceRegistryType.Renderer = {
    name: 'History Summary Prompt Renderer',
    slug: 'history_summary_prompt_renderer',
    description: 'Renders AI prompt history summaries with context and stats',
};

interface HistorySummaryPromptRendererProps {
    payload?: Record<string, unknown>;
    status?: 'streaming' | 'completed';
    summary?: string;
    prompt_count?: number;
    token_count?: number;
    source?: string;
    turn_index?: number;
    timestamp?: string | number;
    [key: string]: unknown;
}

export default function HistorySummaryPromptRenderer(props: HistorySummaryPromptRendererProps) {
    const payload = (props.payload && typeof props.payload === 'object') ? props.payload : props;
    const summary = typeof payload.summary === 'string' ? payload.summary : 'No summary available';
    const promptCount = typeof payload.prompt_count === 'number' ? payload.prompt_count : 0;
    const tokenCount = typeof payload.token_count === 'number' ? payload.token_count : 0;
    const source = typeof payload.source === 'string' ? payload.source : 'unknown';
    const turnIndex = typeof payload.turn_index === 'number' ? payload.turn_index : undefined;

    return (
        <div className="bg-slate-50 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-900/50 rounded-lg p-3 space-y-2">
            <div className="flex items-start gap-2">
                <MessageCircle size={16} className="text-slate-600 dark:text-slate-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        Prompt History Summary
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        Source: <span className="font-mono">{source}</span>
                        {turnIndex !== undefined && <> · Turn <span className="font-mono">{turnIndex}</span></>}
                    </div>
                </div>
            </div>

            <div className="ml-6 text-sm text-slate-800 dark:text-slate-200 bg-white dark:bg-zinc-900 rounded p-2 max-h-32 overflow-auto leading-relaxed">
                {summary}
            </div>

            <div className="ml-6 flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                <span className="flex items-center gap-1">
                    <span className="font-semibold">{promptCount}</span>
                    <span>prompts</span>
                </span>
                <span className="w-1 h-1 rounded-full bg-slate-400 dark:bg-slate-600" />
                <span className="flex items-center gap-1">
                    <span className="font-semibold">{tokenCount}</span>
                    <span>tokens</span>
                </span>
            </div>
        </div>
    );
}
