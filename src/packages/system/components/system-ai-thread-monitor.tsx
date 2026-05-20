import { useMemo } from 'react';
import { Bot, Database } from 'lucide-react';

import { KernelEngine } from '#/shared/engines/kernel-engine';
import type { AgentThread } from '#/shared/schemas/ai';
import { defineComponent } from '#/lib/define-registry';

import { SystemMemoryTable } from './system-memory-table';
import { formatBytes, useRuntimeMonitorSnapshots } from './system-runtime-monitor-data';
import { SectionShell, SummaryCard } from './system-runtime-monitor-shared';

type AIThreadMonitorEntry = {
	memory_uid: string;
	process_uid: string;
	approx_bytes: number;
	type: string;
	child_count: number;
	thread_uid: string;
	provider: string;
	model: string;
	message_count: number;
	state_key_count: number;
	updated_at: number;
};

function resolveThreadEntries() {
	const ramStats = KernelEngine.getRAMStats();
	const entries = ramStats.largest_memories.filter((entry) => {
		return (
			entry.memory_uid.startsWith('system:ai_engine:thread:') &&
			entry.memory_uid !== 'system:ai_engine:thread:uids' &&
			entry.memory_uid !== 'system:ai_engine:thread:active_uid'
		);
	});

	return entries
		.map((entry) => {
			const thread = KernelEngine.readMemory(entry.memory_uid) as AgentThread | undefined;
			if (!thread || typeof thread !== 'object') {
				return null;
			}

			return {
				...entry,
				thread_uid: thread.thread_uid || entry.memory_uid.replace('system:ai_engine:thread:', ''),
				provider: thread.provider || '-',
				model: thread.model || '-',
				message_count: Array.isArray(thread.messages) ? thread.messages.length : 0,
				state_key_count:
					thread.state && typeof thread.state === 'object'
						? Object.keys(thread.state).length
						: 0,
				updated_at: typeof thread.updated_at === 'number' ? thread.updated_at : 0,
			} as AIThreadMonitorEntry;
		})
		.filter((entry): entry is AIThreadMonitorEntry => Boolean(entry))
		.sort((left, right) => right.updated_at - left.updated_at);
}

function formatRelativeTime(timestamp: number) {
	if (!timestamp) {
		return '-';
	}

	const diffMs = Date.now() - timestamp;
	if (diffMs < 60_000) {
		return `${Math.max(1, Math.round(diffMs / 1000))}s ago`;
	}

	if (diffMs < 3_600_000) {
		return `${Math.round(diffMs / 60_000)}m ago`;
	}

	return `${Math.round(diffMs / 3_600_000)}h ago`;
}

function SystemAIThreadMonitor() {
	useRuntimeMonitorSnapshots();

	const activeThreadUid = (KernelEngine.readMemory('system:ai_engine:thread:active_uid') as string | null) ?? null;
	const threadIndex =
		(KernelEngine.readMemory('system:ai_engine:thread:uids') as Record<string, string> | undefined) ?? {};
	const threadEntries = useMemo(() => resolveThreadEntries(), [activeThreadUid, threadIndex]);
	const totalThreadBytes = useMemo(
		() => threadEntries.reduce((total, entry) => total + entry.approx_bytes, 0),
		[threadEntries],
	);
	const totalMessages = useMemo(
		() => threadEntries.reduce((total, entry) => total + entry.message_count, 0),
		[threadEntries],
	);

	return (
		<div className="flex h-full min-h-0 flex-col gap-4 p-4">
			<section className="system-shell-primary flex flex-col items-start justify-between gap-4 rounded-2xl p-5">
				<div>
					<div className="text-xs uppercase tracking-[0.24em]">AI Thread Monitor</div>
					<div className="mt-2 text-2xl font-semibold">Kernel-Side AI Thread Footprint</div>
					<div className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
						Inspect every persisted AI thread snapshot currently occupying kernel RAM, including payload size, message volume, provider/model metadata, and the raw stored state.
					</div>
				</div>
				<div className="grid min-w-[420px] grid-cols-4 gap-3">
					<SummaryCard
						title="Tracked Threads"
						value={String(threadEntries.length)}
						description="AI thread memories currently present in physical kernel RAM."
						icon={Database}
					/>
					<SummaryCard
						title="Thread RAM"
						value={formatBytes(totalThreadBytes)}
						description="Estimated RAM footprint across persisted AI thread snapshots."
						icon={Database}
					/>
					<SummaryCard
						title="Messages"
						value={String(totalMessages)}
						description="Total persisted messages across all thread snapshots in RAM."
						icon={Database}
					/>
					<SummaryCard
						title="Active Thread"
						value={activeThreadUid ? `${activeThreadUid.slice(0, 8)}...` : '-'}
						description="Current active thread pointer tracked by the desktop AI engine."
						icon={Database}
					/>
				</div>
			</section>

			<SectionShell
				title="Persisted Thread Memories"
				description="Thread snapshots stored under kernel memory keys. Expand a row to inspect the full persisted payload, including messages and state."
				icon={Bot}
			>
				<SystemMemoryTable
					entries={threadEntries}
					emptyMessage="No AI thread snapshots are currently present in kernel RAM."
					columns={[
						{
							header: 'Thread UID',
							className: 'font-mono text-[11px]',
							render: (entry) => entry.thread_uid,
						},
						{
							header: 'Provider',
							render: (entry) => entry.provider,
						},
						{
							header: 'Model',
							render: (entry) => entry.model,
						},
						{
							header: 'Messages',
							render: (entry) => entry.message_count,
						},
						{
							header: 'Updated',
							render: (entry) => formatRelativeTime(entry.updated_at),
						},
						{
							header: 'Approx',
							render: (entry) => formatBytes(entry.approx_bytes),
						},
					]}
					resolveExpandedTitle={(entry) => `thread: ${entry.thread_uid} | memory: ${entry.memory_uid}`}
					resolveExpandedValue={(entry) => KernelEngine.readMemory(entry.memory_uid)}
				/>
			</SectionShell>
		</div>
	);
}

export default defineComponent(SystemAIThreadMonitor, {
	name: 'system_ai_thread_monitor',
	slug: 'system-ai-thread-monitor',
	react_behavior: 'system_ai_thread_monitor',
});