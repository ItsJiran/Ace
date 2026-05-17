import type { AceRegistryType } from '#/schemas/registry-types';
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
        <div className="system-chat-renderer-surface p-3 space-y-2">
            <div className="flex items-start gap-2">
                <MessageCircle size={16} className="system-chat-tone-success mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <div className="system-chat-copy-strong text-sm font-semibold">
                        Response History Summary
                    </div>
                    <div className="system-chat-copy-muted mt-0.5 text-xs">
                        Source: <span className="system-chat-mono font-mono">{source}</span>
                        {turnIndex !== undefined && <> · Turn <span className="system-chat-mono font-mono">{turnIndex}</span></>}
                    </div>
                </div>
            </div>

            <div className="system-chat-summary-card ml-6 max-h-32 overflow-auto">
                {summary}
            </div>

            <div className="system-chat-stat-row ml-6">
                <span className="flex items-center gap-1">
                    <span className="font-semibold">{responseCount}</span>
                    <span>responses</span>
                </span>
                <span className="system-chat-stat-dot" />
                <span className="flex items-center gap-1">
                    <span className="font-semibold">{tokenCount}</span>
                    <span>tokens</span>
                </span>
            </div>
        </div>
    );
}
