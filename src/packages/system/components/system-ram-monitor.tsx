import { Database } from 'lucide-react';

import { RenderCounterBadge } from '#/app-desktop/components/dev/render-counter-badge';
import { defineComponent } from '#/lib/define-registry';

import {
	formatBytes,
	useRuntimeMonitorSnapshots,
} from './system-runtime-monitor-data';
import {
	SectionShell,
	SummaryCard,
} from './system-runtime-monitor-shared';

function SystemRAMMonitor() {
	const { ramStats, topRamEntries } = useRuntimeMonitorSnapshots();

	return (
		<div className="flex h-full min-h-0 flex-col gap-4 p-4">
			<section className="system-shell-primary flex-col rounded-2xl p-5 flex items-start justify-between gap-4">
				<div>
					<div className="text-xs uppercase tracking-[0.24em]">Kernel RAM Monitor</div>
					<div className="mt-2 text-2xl font-semibold">Live Memory Pressure Snapshot</div>
					<div className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
						Track the largest kernel memory blocks, listener totals, and approximate payload size to spot oversized state before it spreads into thread or window churn.
					</div>
				</div>
				<div className="grid min-w-[420px] grid-cols-4 gap-3">
					<SummaryCard
						title="Memory Entries"
						value={String(ramStats.memory_entries)}
						description="Total kernel memory keys currently allocated."
						icon={Database}
					/>
					<SummaryCard
						title="Approx RAM"
						value={formatBytes(ramStats.approx_total_bytes)}
						description="Estimated payload size across tracked kernel memories."
						icon={Database}
					/>
					<SummaryCard
						title="Listeners"
						value={String(ramStats.change_listener_total)}
						description="Registered change listeners across tracked memory nodes."
						icon={Database}
					/>
					<SummaryCard
						title="Largest Blocks"
						value={String(topRamEntries.length)}
						description="Top memory entries by estimated size in the current sample."
						icon={Database}
					/>
				</div>
			</section>

			<SectionShell
				title="Largest Memory Blocks"
				description="Largest entries by estimated size, useful for isolating heavy thread state, config payloads, or window snapshots."
				icon={Database}
			>
				<div className="grid grid-cols-3 gap-3 text-xs text-zinc-400">
					<div className="rounded-xl bg-black/20 px-3 py-2">Listeners: {ramStats.change_listener_total}</div>
					<div className="rounded-xl bg-black/20 px-3 py-2">Total KB: {ramStats.approx_total_kb.toFixed(1)}</div>
					<div className="rounded-xl bg-black/20 px-3 py-2">Total MB: {ramStats.approx_total_mb.toFixed(3)}</div>
				</div>
				<div className="min-h-0 flex-1 overflow-auto rounded-2xl">
					<table className="min-w-full text-left text-xs text-zinc-300">
						<thead className="sticky top-0 bg-zinc-950/90">
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
								<tr key={entry.memory_uid} className="system-container-primary align-top">
									<td className="px-3 py-2 font-mono text-[11px]">{entry.memory_uid}</td>
									<td className="px-3 py-2 font-mono text-[11px]">{entry.process_uid}</td>
									<td className="px-3 py-2 uppercase">{entry.type}</td>
									<td className="px-3 py-2">{entry.child_count}</td>
									<td className="px-3 py-2">{formatBytes(entry.approx_bytes)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</SectionShell>
		</div>
	);
}

export default defineComponent(SystemRAMMonitor, {
	name: 'system_ram_monitor',
	slug: 'system-ram-monitor',
	react_behavior: 'system_ram_monitor',
});