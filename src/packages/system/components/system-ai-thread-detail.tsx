import { useMemo, useCallback, useState } from 'react';
import { Bot, Braces, Database, MessageSquareText, Workflow, RefreshCw, FileText, Folder, Wrench, Brain } from 'lucide-react';

import { useAceMemory } from '#/app-desktop/hooks/use-ace-memory';
import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';
import {
	resolveAdditionalKwargs,
	resolveContentText,
	resolveMessageKind,
	resolveResponseMetadata,
	resolveThreadEnvelope,
	resolveTokenSummary,
	resolveToolCalls,
	resolveUsage,
	type SerializedAgentMessage,
} from '#/app-desktop/lib/utils/ai-thread-detail';
import type { AgentThread } from '#/shared/schemas/ai';

import { AgentClientEngine } from '#/app-desktop/engines/agent-client-engine';
import { MetaGrid, StructuredValueBlock } from './tools/tool-renderer-shared';
import { SectionShell, SummaryCard } from './system-runtime-monitor-shared';

function MessageCard({ message, index }: { message: SerializedAgentMessage; index: number }) {
	const { targets } = useAceTheme();
	const messageKind = resolveMessageKind(message);
	const kwargs = (message.kwargs ?? {}) as Record<string, unknown>;
	const usage = resolveUsage(message);
	const toolCalls = resolveToolCalls(message);
	const contentText = resolveContentText(kwargs.content);
	const additionalKwargs = resolveAdditionalKwargs(message);
	const responseMetadata = resolveResponseMetadata(message);

	return (
		<div className="rounded-2xl border border-white/10 bg-black/15 overflow-auto p-4">
			<div className="flex flex-wrap items-center gap-2">
				<span className={[targets.btn.secondary, 'rounded-2xl px-3 py-1 text-[11px] uppercase tracking-[0.22em]'].join(' ')}>
					#{index + 1}
				</span>
				<span className={[targets.btn.first, 'rounded-2xl px-3 py-1 text-[11px] uppercase tracking-[0.22em]'].join(' ')}>
					{messageKind}
				</span>
				{typeof kwargs.name === 'string' ? (
					<span className={[targets.btn.first, 'rounded-2xl px-3 py-1 text-[11px]'].join(' ')}>{kwargs.name}</span>
				) : null}
				{typeof kwargs.id === 'string' ? (
					<span className={[targets.btn.first, 'rounded-2xl px-3 py-1 font-mono text-[11px]'].join(' ')}>{kwargs.id}</span>
				) : null}
			</div>

			<div className="mt-3 rounded-2xl bg-zinc-950/70 p-4 text-sm leading-6 text-zinc-100 whitespace-pre-wrap break-words">
				{contentText || '-'}
			</div>

			<div className="mt-3">
				<MetaGrid
					items={[
						{ label: 'Tool Calls', value: toolCalls.length ? String(toolCalls.length) : null },
						{ label: 'Input Tokens', value: usage?.input_tokens != null ? String(usage.input_tokens) : null },
						{ label: 'Output Tokens', value: usage?.output_tokens != null ? String(usage.output_tokens) : null },
						{ label: 'Total Tokens', value: usage?.total_tokens != null ? String(usage.total_tokens) : null },
					]}
				/>
			</div>

			{toolCalls.length ? (
				<div className="mt-3">
					<div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">Tool Calls</div>
					<StructuredValueBlock value={toolCalls} />
				</div>
			) : null}

			{additionalKwargs ? (
				<div className="mt-3">
					<div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">Additional Kwargs</div>
					<StructuredValueBlock value={additionalKwargs} />
				</div>
			) : null}

			{responseMetadata ? (
				<div className="mt-3">
					<div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">Response Metadata</div>
					<StructuredValueBlock value={responseMetadata} />
				</div>
			) : null}
		</div>
	);
}

// ═══════════════════════════════════════════════════════════════════════════
//  Dev State Prop Renderers
// ═══════════════════════════════════════════════════════════════════════════

function MemoryItemCard({ item }: { item: Record<string, unknown> }) {
    const { targets } = useAceTheme();
    const type = String(item.type ?? '-');
    const isExpanded = item.is_expanded === true;

    return (
        <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-3">
            <div className="flex items-center gap-2">
                <Brain className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span className="text-xs font-semibold text-purple-400 font-mono">{String(item.key)}</span>
                <span className={[targets.btn.secondary, 'rounded-md px-1.5 py-0.5 text-[10px]'].join(' ')}>{type}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${isExpanded ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            </div>
            <div className="mt-2 text-xs text-zinc-400 leading-relaxed">{String(item.content ?? '-')}</div>
            <div className="mt-1 text-[10px] text-zinc-600 font-mono">id: {String(item.id).slice(0, 8)}</div>
        </div>
    );
}

function ContextItemCard({ item }: { item: Record<string, unknown> }) {
    const { targets } = useAceTheme();
    const type = String(item.type ?? 'tool');
    const isExpanded = item.is_expanded === true;

    const icon = type === 'file' ? <FileText className="w-3.5 h-3.5 text-sky-400" />
        : type === 'directory' ? <Folder className="w-3.5 h-3.5 text-amber-400" />
        : <Wrench className="w-3.5 h-3.5 text-rose-400" />;

    const accent = type === 'file' ? 'border-sky-500/20 bg-sky-500/5 text-sky-400'
        : type === 'directory' ? 'border-amber-500/20 bg-amber-500/5 text-amber-400'
        : 'border-rose-500/20 bg-rose-500/5 text-rose-400';

    return (
        <div className={`rounded-xl border ${accent.split(' ')[0]} ${accent.split(' ')[1]} p-3`}>
            <div className="flex items-center gap-2 flex-wrap">
                {icon}
                <span className={`text-xs font-semibold font-mono ${accent.split(' ')[2]}`}>{String(item.key)}</span>
                <span className={[targets.btn.secondary, 'rounded-md px-1.5 py-0.5 text-[10px]'].join(' ')}>{type}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${isExpanded ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
            </div>
            <div className="mt-1 text-xs text-zinc-400">{String(item.summary ?? '-')}</div>
            {type === 'file' || type === 'directory' ? (
                <div className="mt-2 rounded-md bg-black/30 p-2 text-[11px] text-zinc-300 font-mono max-h-24 overflow-auto whitespace-pre-wrap">
                    {String(item.content ?? '-')}
                </div>
            ) : (
                <div className="mt-1 flex gap-3 text-[10px] text-zinc-500">
                    {item.payload ? <span>payload: {String(item.payload).split('/').pop()}</span> : null}
                    {item.output ? <span>output: {String(item.output).split('/').pop()}</span> : null}
                </div>
            )}
        </div>
    );
}

function CycleCard({ cycle, index }: { cycle: Record<string, unknown>; index: number }) {
    const { targets } = useAceTheme();
    const actions = Array.isArray(cycle.actions) ? cycle.actions as Record<string, unknown>[] : [];

    return (
        <div className="rounded-xl border border-zinc-500/20 bg-zinc-500/5 p-3">
            <div className="flex items-center gap-2">
                <span className={[targets.btn.first, 'rounded-md px-2 py-0.5 text-[11px] font-semibold'].join(' ')}>#{index + 1}</span>
                <span className="text-xs text-zinc-300 font-medium truncate">{String(cycle.subject ?? '-').slice(0, 80)}</span>
            </div>
            <div className="mt-1 text-xs text-zinc-500 italic">"{String(cycle.thought ?? '-').slice(0, 200)}"</div>
            {cycle.result_summary ? (
                <div className="mt-1 text-[11px] text-emerald-400">↳ {String(cycle.result_summary)}</div>
            ) : null}
            {actions.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {actions.map((a, ai) => (
                        <span key={ai} className={[
                            'rounded-md px-2 py-0.5 text-[10px] font-mono',
                            a.status === 'done' ? 'bg-emerald-500/15 text-emerald-400'
                                : a.status === 'running' ? 'bg-blue-500/15 text-blue-400'
                                : a.status === 'failed' ? 'bg-red-500/15 text-red-400'
                                : 'bg-zinc-500/15 text-zinc-500'
                        ].join(' ')}>
                            {String((a.target as any)?.name ?? a.target ?? '-')} · {String(a.status)}
                        </span>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════════════════════════════

export function SystemAIThreadDetail({ memoryUid, threadUid }: { memoryUid: string; threadUid: string }) {
	const { targets } = useAceTheme();
	const payload = useAceMemory<AgentThread>(memoryUid);
	const [syncing, setSyncing] = useState(false);

	const handleSyncFromWorkflow = useCallback(async () => {
		setSyncing(true);
		try {
			await AgentClientEngine.syncCurrentThreadFromBackground(threadUid);
		} finally {
			setSyncing(false);
		}
	}, [threadUid]);
	const envelope = useMemo(() => resolveThreadEnvelope(memoryUid, payload), [memoryUid, payload]);
	const stateMessages = Array.isArray(payload?.state?.messages)
		? (payload.state.messages as SerializedAgentMessage[])
		: [];
	const stateTokenSummary = useMemo(() => resolveTokenSummary(stateMessages), [stateMessages]);

	// Dev-only: extract full workflow state fields for inspection
	const devState = payload?.state as Record<string, unknown> | undefined;
	const stateMemories = Array.isArray(devState?.memories) ? devState.memories : null;
	const stateContexts = Array.isArray(devState?.contexts) ? devState.contexts : null;
	const stateCycles = Array.isArray(devState?.cycles) ? devState.cycles : null;
	const stateCurrentCycle = devState?.current_cycle ?? null;

	return (
		<div className="flex flex-col gap-4 p-4 overflow-auto">
			<section className={[targets.shell.first, 'flex flex-col items-start justify-between gap-4 rounded-2xl p-5 h-fit overflow-auto'].join(' ')}>
				<div>
					<div className="text-xs uppercase tracking-[0.24em]">AI Thread Detail</div>
					<div className="mt-2 text-2xl font-semibold">Formatted Persisted Thread Snapshot</div>
					<div className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
						Inspect the persisted thread payload as structured UI instead of raw JSON, including message flow, token usage, state messages, and the raw envelope.
					</div>
				</div>
				<div className="flex items-center gap-3 flex-wrap">
					<button
						onClick={handleSyncFromWorkflow}
						disabled={syncing}
						className={[
							targets.btn.first,
							'rounded-2xl px-3 py-1.5 text-xs flex items-center gap-2',
							syncing ? 'opacity-60' : '',
						].join(' ')}
					>
						<RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
						{syncing ? 'Syncing...' : 'Sync from Workflow'}
					</button>
				</div>

				<div className="grid min-w-[420px] grid-cols-4 gap-3">
					<SummaryCard
						title="Thread UID"
						value={threadUid.slice(0, 8)}
						description="Current inspected thread reference."
						icon={Bot}
					/>
					<SummaryCard
						title="Provider"
						value={payload?.provider || '-'}
						description="Persisted model provider stored on the thread."
						icon={Database}
					/>
					<SummaryCard
						title="Messages"
						value={String(stateMessages.length)}
						description="Persisted message count from state.messages."
						icon={MessageSquareText}
					/>
					<SummaryCard
						title="State Keys"
						value={String(payload?.state ? Object.keys(payload.state).length : 0)}
						description="Number of keys inside the persisted state object."
						icon={Workflow}
					/>
				</div>
			</section>

			<SectionShell
				title="Thread Summary"
				description="Primary metadata stored with the thread snapshot."
				icon={Database}
			>
				<MetaGrid
					items={[
						{ label: 'Memory UID', value: memoryUid },
						{ label: 'Thread UID', value: payload?.thread_uid || threadUid },
						{ label: 'Provider', value: payload?.provider || '-' },
						{ label: 'Model', value: payload?.model || '-' },
						{ label: 'Created At', value: payload?.created_at ? String(payload.created_at) : '-' },
						{ label: 'Updated At', value: payload?.updated_at ? String(payload.updated_at) : '-' },
						{ label: 'State Input Tokens', value: stateTokenSummary.input_tokens ? String(stateTokenSummary.input_tokens) : '-' },
						{ label: 'State Output Tokens', value: stateTokenSummary.output_tokens ? String(stateTokenSummary.output_tokens) : '-' },
						{ label: 'State Total Tokens', value: stateTokenSummary.total_tokens ? String(stateTokenSummary.total_tokens) : '-' },
					]}
				/>
			</SectionShell>

			<SectionShell
				title="State Messages"
				description="Messages currently nested under thread.state.messages."
				icon={Workflow}
			>
				<div className="flex min-h-0 flex-col gap-3 overflow-auto pr-1">
					{stateMessages.length ? stateMessages.map((message, index) => (
						<MessageCard key={`${threadUid}-state-${index}`} message={message} index={index} />
					)) : <div className={[targets.btn.first, 'rounded-2xl px-4 py-3 text-sm text-zinc-500'].join(' ')}>No state.messages payload.</div>}
				</div>
			</SectionShell>

			{/* ── Dev: Workflow State Props ────────────────────────────────── */}
			{stateMemories ? (
				<SectionShell
					title={`Memories (${(stateMemories as any[]).length})`}
					description="Active memory items from state.memories (dev mode)."
					icon={Database}
				>
					<div className="flex flex-col gap-2">
						{(stateMemories as any[]).map((item, i) => (
							<MemoryItemCard key={i} item={item} />
						))}
					</div>
				</SectionShell>
			) : null}

			{stateContexts ? (
				<SectionShell
					title={`Contexts (${(stateContexts as any[]).length})`}
					description="File, directory, and tool contexts from state.contexts (dev mode)."
					icon={Database}
				>
					<div className="flex flex-col gap-2">
						{(stateContexts as any[]).map((item, i) => (
							<ContextItemCard key={i} item={item} />
						))}
					</div>
				</SectionShell>
			) : null}

			{stateCycles ? (
				<SectionShell
					title={`Cycles (${(stateCycles as any[]).length})`}
					description="Thought → action cycles from state.cycles (dev mode)."
					icon={Workflow}
				>
					<div className="flex flex-col gap-2">
						{(stateCycles as any[]).map((cycle, i) => (
							<CycleCard key={i} cycle={cycle} index={i} />
						))}
					</div>
				</SectionShell>
			) : null}

			{stateCurrentCycle ? (
				<SectionShell
					title="Current Cycle"
					description="Active cycle from state.current_cycle (dev mode)."
					icon={Workflow}
				>
					<StructuredValueBlock value={stateCurrentCycle} />
				</SectionShell>
			) : null}

			<SectionShell
				title="State Payload"
				description="Full persisted state object for this thread. The simplified workflow now keeps only messages here by default."
				icon={Workflow}
			>
				<StructuredValueBlock value={payload?.state ?? {}} />
			</SectionShell>


			<SectionShell
				title="Raw Envelope"
				description="Full key/value payload currently stored in kernel memory for this thread."
				icon={Braces}
			>
				<StructuredValueBlock value={envelope} />
			</SectionShell>
		</div>
	);
}
export default SystemAIThreadDetail;