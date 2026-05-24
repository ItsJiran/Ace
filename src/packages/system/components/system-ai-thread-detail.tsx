import { useMemo } from 'react';
import { Bot, Braces, Database, MessageSquareText, Workflow } from 'lucide-react';

import { useAceMemory } from '#/app-desktop/hooks/use-ace-memory';
import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';
import type { AgentThread } from '#/shared/schemas/ai';

import { MetaGrid, StructuredValueBlock } from './tools/tool-renderer-shared';
import { SectionShell, SummaryCard } from './system-runtime-monitor-shared';

type SerializedAgentMessage = {
	lc?: number;
	type?: string;
	id?: unknown[];
	kwargs?: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return null;
	}

	return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function resolveThreadEnvelope(memoryUid: string, payload: AgentThread | undefined) {
	return {
		key: memoryUid,
		value: payload,
	};
}

function resolveMessageKind(message: SerializedAgentMessage) {
	const idPath = asArray(message.id);
	const lastSegment = idPath.at(-1);

	if (typeof lastSegment === 'string' && lastSegment.endsWith('Message')) {
		return lastSegment.replace(/Message$/, '');
	}

	return typeof lastSegment === 'string' ? lastSegment : 'Message';
}

function stringifyUnknown(value: unknown) {
	if (typeof value === 'string') {
		return value;
	}

	if (value == null) {
		return '';
	}

	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function resolveContentText(content: unknown) {
	if (typeof content === 'string') {
		return content;
	}

	if (!Array.isArray(content)) {
		return stringifyUnknown(content);
	}

	return content
		.map((item) => {
			const record = asRecord(item);
			if (!record) {
				return stringifyUnknown(item);
			}

			if (record.type === 'text' && typeof record.text === 'string') {
				return record.text;
			}

			if (record.type === 'tool_call') {
				return `tool_call: ${String(record.name ?? '-')}`;
			}

			return stringifyUnknown(item);
		})
		.filter(Boolean)
		.join('\n\n');
}

function resolveToolCalls(message: SerializedAgentMessage) {
	return asArray(message.kwargs?.tool_calls);
}

function resolveUsage(message: SerializedAgentMessage) {
	return asRecord(message.kwargs?.usage_metadata);
}

function resolveAdditionalKwargs(message: SerializedAgentMessage) {
	return asRecord(message.kwargs?.additional_kwargs);
}

function resolveResponseMetadata(message: SerializedAgentMessage) {
	return asRecord(message.kwargs?.response_metadata);
}

function resolveTokenSummary(messages: SerializedAgentMessage[]) {
	return messages.reduce(
		(summary, message) => {
			const usage = resolveUsage(message);
			return {
				input_tokens: summary.input_tokens + Number(usage?.input_tokens ?? 0),
				output_tokens: summary.output_tokens + Number(usage?.output_tokens ?? 0),
				total_tokens: summary.total_tokens + Number(usage?.total_tokens ?? 0),
			};
		},
		{
			input_tokens: 0,
			output_tokens: 0,
			total_tokens: 0,
		},
	);
}

function MessageCard({ message, index }: { message: SerializedAgentMessage; index: number }) {
	const { targets } = useAceTheme();
	const messageKind = resolveMessageKind(message);
	const kwargs = asRecord(message.kwargs) ?? {};
	const usage = resolveUsage(message);
	const toolCalls = resolveToolCalls(message);
	const contentText = resolveContentText(kwargs.content);
	const additionalKwargs = resolveAdditionalKwargs(message);
	const responseMetadata = resolveResponseMetadata(message);

	return (
		<div className="rounded-2xl border border-white/10 bg-black/15 p-4">
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

export function SystemAIThreadDetail({ memoryUid, threadUid }: { memoryUid: string; threadUid: string }) {
	const { targets } = useAceTheme();
	const payload = useAceMemory<AgentThread>(memoryUid);
	const envelope = useMemo(() => resolveThreadEnvelope(memoryUid, payload), [memoryUid, payload]);
	const threadMessages = Array.isArray(payload?.messages) ? (payload.messages as SerializedAgentMessage[]) : [];
	const stateMessages = Array.isArray(payload?.state?.messages)
		? (payload.state.messages as SerializedAgentMessage[])
		: [];
	const snapshotMessages = Array.isArray(payload?.snapshot?.messages)
		? (payload.snapshot.messages as SerializedAgentMessage[])
		: [];
	const persistedTokenSummary = useMemo(() => resolveTokenSummary(threadMessages), [threadMessages]);
	const stateTokenSummary = useMemo(() => resolveTokenSummary(stateMessages), [stateMessages]);
	const snapshotTokenSummary = useMemo(() => resolveTokenSummary(snapshotMessages), [snapshotMessages]);

	return (
		<div className="flex h-full min-h-0 flex-col gap-4 p-4">
			<section className={[targets.shell.first, 'flex flex-col items-start justify-between gap-4 rounded-2xl p-5'].join(' ')}>
				<div>
					<div className="text-xs uppercase tracking-[0.24em]">AI Thread Detail</div>
					<div className="mt-2 text-2xl font-semibold">Formatted Persisted Thread Snapshot</div>
					<div className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
						Inspect the persisted thread payload as structured UI instead of raw JSON, including message flow, token usage, state messages, and the raw envelope.
					</div>
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
						value={String(threadMessages.length)}
						description="Top-level persisted message count."
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
						{ label: 'Persisted Input Tokens', value: persistedTokenSummary.input_tokens ? String(persistedTokenSummary.input_tokens) : '-' },
						{ label: 'Persisted Output Tokens', value: persistedTokenSummary.output_tokens ? String(persistedTokenSummary.output_tokens) : '-' },
						{ label: 'Persisted Total Tokens', value: persistedTokenSummary.total_tokens ? String(persistedTokenSummary.total_tokens) : '-' },
						{ label: 'State Total Tokens', value: stateTokenSummary.total_tokens ? String(stateTokenSummary.total_tokens) : '-' },
						{ label: 'Snapshot Total Tokens', value: snapshotTokenSummary.total_tokens ? String(snapshotTokenSummary.total_tokens) : '-' },
					]}
				/>
			</SectionShell>

			<SectionShell
				title="Persisted Messages"
				description="Messages stored directly on the thread payload."
				icon={MessageSquareText}
			>
				<div className="flex min-h-0 flex-col gap-3 overflow-auto pr-1">
					{threadMessages.length ? threadMessages.map((message, index) => (
						<MessageCard key={`${threadUid}-message-${index}`} message={message} index={index} />
					)) : <div className={[targets.btn.first, 'rounded-2xl px-4 py-3 text-sm text-zinc-500'].join(' ')}>No persisted messages.</div>}
				</div>
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

			<SectionShell
				title="State Payload"
				description="Full persisted state object for this thread, including nested control flags and graph values."
				icon={Workflow}
			>
				<StructuredValueBlock value={payload?.state ?? {}} />
			</SectionShell>

			{snapshotMessages.length ? (
				<SectionShell
					title="Snapshot Messages"
					description="Readonly snapshot copy currently nested under thread.snapshot.messages."
					icon={Bot}
				>
					<div className="flex min-h-0 flex-col gap-3 overflow-auto pr-1">
						{snapshotMessages.map((message, index) => (
							<MessageCard key={`${threadUid}-snapshot-${index}`} message={message} index={index} />
						))}
					</div>
				</SectionShell>
			) : null}

			{payload?.snapshot ? (
				<SectionShell
					title="Snapshot Payload"
					description="Readonly persisted snapshot copy currently attached to the thread object."
					icon={Bot}
				>
					<StructuredValueBlock value={payload.snapshot} />
				</SectionShell>
			) : null}

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