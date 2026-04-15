import type { AceRegistryType } from '#/schemas/registryTypes';
import { MessageCircle } from 'lucide-react';

export const registry: AceRegistryType.Renderer = {
    name: 'History Summary Response Renderer',
    slug: 'history_summary_response_renderer',
    description: 'Renders AI response history summaries with context and stats',
};

interface HistorySummaryResponseRendererProps {
    payload?: Record<string, unknown>;
    status?: 'streaming' | 'completed';
    summary?: string;
    response_count?: number;
    token_count?: number;
    source?: string;
    turn_index?: number;
    timestamp?: string | number;
    [key: string]: unknown;
}

export default function HistorySummaryResponseRenderer(props: HistorySummaryResponseRendererProps) {
    const payload = (props.payload && typeof props.payload === 'object') ? props.payload : props;
    const summary = typeof payload.summary === 'string' ? payload.summary : 'No summary available';
    const responseCount = typeof payload.response_count === 'number' ? payload.response_count : 0;
    const tokenCount = typeof payload.token_count === 'number' ? payload.token_count : 0;
    const source = typeof payload.source === 'string' ? payload.source : 'unknown';
    const turnIndex = typeof payload.turn_index === 'number' ? payload.turn_index : undefined;

    return (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-lg p-3 space-y-2">
            <div className="flex items-start gap-2">
                <MessageCircle size={16} className="text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                        Response History Summary
                    </div>
                    <div className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                        Source: <span className="font-mono">{source}</span>
                        {turnIndex !== undefined && <> · Turn <span className="font-mono">{turnIndex}</span></>}
                    </div>
                </div>
            </div>

            <div className="ml-6 text-sm text-emerald-900 dark:text-emerald-100 bg-white dark:bg-zinc-900 rounded p-2 max-h-32 overflow-auto leading-relaxed">
                {summary}
            </div>

            <div className="ml-6 flex items-center gap-3 text-xs text-emerald-700 dark:text-emerald-300">
                <span className="flex items-center gap-1">
                    <span className="font-semibold">{responseCount}</span>
                    <span>responses</span>
                </span>
                <span className="w-1 h-1 rounded-full bg-emerald-400 dark:bg-emerald-600" />
                <span className="flex items-center gap-1">
                    <span className="font-semibold">{tokenCount}</span>
                    <span>tokens</span>
                </span>
            </div>
        </div>
    );
}
