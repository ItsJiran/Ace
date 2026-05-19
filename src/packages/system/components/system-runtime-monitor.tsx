import { useEffect, useMemo, useState } from 'react';
import { Bot, Cpu, Database, Radio } from 'lucide-react';

import { RenderCounterBadge } from '#/app-desktop/components/dev/render-counter-badge';
import { useAceMemory } from '#/app-desktop/hooks/use-ace-memory';
import { defineComponent } from '#/lib/define-registry';
import { EventBus } from '#/shared/engines/event-engine';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import type { EventData } from '#/shared/schemas/events';
import type { ProcessRecord } from '#/shared/schemas/process';

type RAMEntryType = {
	memory_uid: string;
	process_uid: string;
	approx_bytes: number;
	type: string;
	child_count: number;
};

type RAMStatsType = {
	memory_entries: number;
	change_listener_total: number;
	approx_total_bytes: number;
	approx_total_kb: number;
	approx_total_mb: number;
	largest_memories: RAMEntryType[];
};

type EventEntryType = {
	slug: string;
	event_data: EventData<Record<string, unknown>, Record<string, unknown>>;
};

type ProcessSystemValueType = Map<string, unknown> | Record<string, unknown> | undefined;

function formatBytes(bytes: number) {
	if (bytes >= 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	}

	if (bytes >= 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}

	return `${bytes} B`;
}

function resolveProcessCount(processSystem: ProcessSystemValueType, processRecords: ProcessRecord[]) {
	if (processSystem instanceof Map) {
		return processSystem.size;
	}

	if (processSystem && typeof processSystem === 'object') {
		return Object.keys(processSystem).length;
	}

	return processRecords.length;
}

function SummaryCard({
	title,
	value,
	description,
	icon: Icon,
}: {
	title: string;
	value: string;
	description: string;
	icon: typeof Database;
}) {
	return (
		<div className="system-container-tertiary rounded-2xl px-4 py-3">
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="text-xs uppercase tracking-[0.24em] text-zinc-500">{title}</div>
					<div className="mt-2 text-2xl font-semibold text-zinc-100">{value}</div>
					<div className="mt-1 text-xs leading-5 text-zinc-400">{description}</div>
				</div>
				<div className="rounded-2xl bg-white/10 p-3 text-zinc-100">
					<Icon size={18} />
				</div>
			</div>
		</div>
	);
}

function SectionShell({
	title,
	description,
	icon: Icon,
	children,
}: {
	title: string;
	description: string;
	icon: typeof Database;
	children: React.ReactNode;
}) {
	return (
		<section className="system-shell-primary rounded-2xl p-4 flex min-h-0 flex-col gap-4 overflow-hidden">
			<div className="flex items-start gap-3">
				<div className="rounded-2xl bg-white/10 p-3 text-zinc-100">
					<Icon size={18} />
				</div>
				<div>
					<div className="text-lg font-semibold text-zinc-100">{title}</div>
					<div className="mt-1 text-sm leading-6 text-zinc-400">{description}</div>
				</div>
			</div>
			{children}
		</section>
	);
}

function SystemRuntimeMonitor() {
	const processSystem = useAceMemory<ProcessSystemValueType>('system:process_system');
	const eventStream = useAceMemory<EventEntryType[]>(EventBus.eventStreamMemoryUid) ?? [];
	const [ramStats, setRamStats] = useState<RAMStatsType>(() => KernelEngine.getRAMStats() as RAMStatsType);
	const [processRecords, setProcessRecords] = useState<ProcessRecord[]>(() => KernelEngine.getAllProcesses());

	useEffect(() => {
		const syncSnapshot = () => {
			setRamStats(KernelEngine.getRAMStats() as RAMStatsType);
			setProcessRecords(KernelEngine.getAllProcesses());
		};

		syncSnapshot();
		const intervalId = window.setInterval(syncSnapshot, 700);
		return () => window.clearInterval(intervalId);
	}, []);

	const topRamEntries = useMemo(() => ramStats.largest_memories.slice(0, 16), [ramStats]);
	const recentEvents = useMemo(() => eventStream.slice(-20).reverse(), [eventStream]);
	const recentProcesses = useMemo(
		() => [...processRecords].sort((left, right) => right.updated_at - left.updated_at).slice(0, 20),
		[processRecords],
	);
	const processCount = resolveProcessCount(processSystem, processRecords);

	return (
		<div className="flex h-full min-h-0 flex-col gap-4 p-4 text-zinc-100">
			<RenderCounterBadge componentName="system-runtime-monitor" />

			<section className="system-shell-primary rounded-2xl p-5 flex items-start justify-between gap-4">
				<div>
					<div className="text-xs uppercase tracking-[0.24em] text-zinc-500">Runtime Monitor</div>
					<div className="mt-2 text-2xl font-semibold text-zinc-100">Kernel Observability Workspace</div>
					<div className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
						Monitor live kernel RAM pressure, active processes, and the event stream from one window. RAM and process snapshots are sampled on a short interval because the kernel does not yet expose a single global mutation feed.
					</div>
				</div>
				<div className="grid grid-cols-2 gap-3 min-w-[360px]">
					<SummaryCard
						title="RAM Entries"
						value={String(ramStats.memory_entries)}
						description="Total kernel memory keys currently allocated."
						icon={Database}
					/>
					<SummaryCard
						title="Processes"
						value={String(processCount)}
						description="Tracked kernel processes in the current snapshot."
						icon={Cpu}
					/>
					<SummaryCard
						title="Event Stream"
						value={String(eventStream.length)}
						description="Total events captured in the in-memory event stream."
						icon={Radio}
					/>
					<SummaryCard
						title="Approx RAM"
						value={formatBytes(ramStats.approx_total_bytes)}
						description="Estimated payload size across tracked kernel memories."
						icon={Bot}
					/>
				</div>
			</section>

			<div className="grid min-h-0 flex-1 grid-cols-[1.1fr_1fr_1fr] gap-4 overflow-hidden">
				<SectionShell
					title="Kernel RAM Monitor"
					description="Largest memory blocks by estimated size, useful for spotting oversized thread state, config payloads, or window state churn."
					icon={Database}
				>
					<div className="grid grid-cols-3 gap-3 text-xs text-zinc-400">
						<div className="rounded-xl bg-black/20 px-3 py-2">Listeners: {ramStats.change_listener_total}</div>
						<div className="rounded-xl bg-black/20 px-3 py-2">Total KB: {ramStats.approx_total_kb.toFixed(1)}</div>
						<div className="rounded-xl bg-black/20 px-3 py-2">Total MB: {ramStats.approx_total_mb.toFixed(3)}</div>
					</div>
					<div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-white/10 bg-black/20">
						<table className="min-w-full text-left text-xs text-zinc-300">
							<thead className="sticky top-0 bg-zinc-950/90 text-zinc-500">
								<tr>
									<th className="px-3 py-2 font-medium">Memory UID</th>
									<th className="px-3 py-2 font-medium">Owner</th>
									<th className="px-3 py-2 font-medium">Type</th>
									<th className="px-3 py-2 font-medium">Children</th>
									<th className="px-3 py-2 font-medium">Approx</th>
								</tr>
							</thead>
							<tbody>
								{topRamEntries.map((entry) => (
									<tr key={entry.memory_uid} className="border-t border-white/5 align-top">
										<td className="px-3 py-2 font-mono text-[11px] text-zinc-200">{entry.memory_uid}</td>
										<td className="px-3 py-2 font-mono text-[11px] text-zinc-400">{entry.process_uid}</td>
										<td className="px-3 py-2 uppercase text-zinc-400">{entry.type}</td>
										<td className="px-3 py-2">{entry.child_count}</td>
										<td className="px-3 py-2">{formatBytes(entry.approx_bytes)}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</SectionShell>

				<SectionShell
					title="Process Monitor"
					description="Recent process records sorted by update timestamp. This is useful for checking stuck lifecycles, parent-child linkage, and engine ownership."
					icon={Cpu}
				>
					<div className="min-h-0 flex-1 overflow-auto space-y-2 pr-1">
						{recentProcesses.length === 0 ? (
							<div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-500">No processes recorded yet.</div>
						) : null}
						{recentProcesses.map((processRecord) => (
							<div key={processRecord.process_uid} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
								<div className="flex items-center justify-between gap-3">
									<div className="font-mono text-[11px] text-zinc-200">{processRecord.process_uid}</div>
									<div className="rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide text-zinc-300">{processRecord.lifecycle_state ?? processRecord.status}</div>
								</div>
								<div className="mt-2 text-sm font-medium text-zinc-100">{processRecord.type}</div>
								<div className="mt-1 text-xs text-zinc-400">owner_engine: {processRecord.owner_engine ?? '-'}</div>
								<div className="text-xs text-zinc-400">parent: {processRecord.parent_process_uid ?? '-'}</div>
								<div className="text-xs text-zinc-500">updated: {new Date(processRecord.updated_at).toLocaleTimeString()}</div>
							</div>
						))}
					</div>
				</SectionShell>

				<SectionShell
					title="Event Bus Monitor"
					description="Recent emitted events from the in-memory event stream. Use this to verify config updates, keybind dispatches, and other runtime signals."
					icon={Radio}
				>
					<div className="min-h-0 flex-1 overflow-auto space-y-2 pr-1">
						{recentEvents.length === 0 ? (
							<div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-500">No events emitted yet.</div>
						) : null}
						{recentEvents.map((entry, index) => (
							<div key={`${entry.slug}:${index}`} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
								<div className="font-mono text-[11px] text-cyan-200">{entry.slug}</div>
								<pre className="mt-2 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-zinc-400">{JSON.stringify(entry.event_data, null, 2)}</pre>
							</div>
						))}
					</div>
				</SectionShell>
			</div>
		</div>
	);
}

export default defineComponent(SystemRuntimeMonitor, {
	name: 'system_runtime_monitor',
	slug: 'system-runtime-monitor',
	react_behavior: 'system_runtime_monitor',
});
