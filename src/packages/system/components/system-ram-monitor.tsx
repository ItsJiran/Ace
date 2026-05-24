import { Database } from 'lucide-react';

import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import { defineComponent } from '#/lib/define-registry';

import {
	formatBytes,
	useRuntimeMonitorSnapshots,
} from './system-runtime-monitor-data';
import {
	SectionShell,
	SummaryCard,
} from './system-runtime-monitor-shared';
import { SystemMemoryTable } from './system-memory-table';

function SystemRAMMonitor() {
	const { ramStats, topRamEntries } = useRuntimeMonitorSnapshots();
	const { targets } = useAceTheme();

	return (
		<div className="flex h-full min-h-0 flex-col gap-4 p-4">
			<section className={[targets.shell.first, 'flex flex-col items-start justify-between gap-4 rounded-2xl p-5'].join(' ')}>
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
					<div className={[targets.container.first, 'rounded-xl px-3 py-2'].join(' ')}>Listeners: {ramStats.change_listener_total}</div>
					<div className={[targets.container.first, 'rounded-xl px-3 py-2'].join(' ')}>Total KB: {ramStats.approx_total_kb.toFixed(1)}</div>
					<div className={[targets.container.first, 'rounded-xl px-3 py-2'].join(' ')}>Total MB: {ramStats.approx_total_mb.toFixed(3)}</div>
				</div>
				<SystemMemoryTable
					entries={topRamEntries}
					emptyMessage="No memory entries available in the current RAM sample."
					columns={[
						{
							header: 'Memory UID',
							className: 'font-mono text-[11px]',
							render: (entry) => entry.memory_uid,
						},
						{
							header: 'Owner',
							className: 'font-mono text-[11px]',
							render: (entry) => entry.process_uid,
						},
						{
							header: 'Type',
							className: 'uppercase',
							render: (entry) => entry.type,
						},
						{
							header: 'Children',
							render: (entry) => entry.child_count,
						},
						{
							header: 'Approx',
							render: (entry) => formatBytes(entry.approx_bytes),
						},
					]}
					resolveExpandedTitle={(entry) => `memory: ${entry.memory_uid}`}
					resolveExpandedValue={(entry) => KernelEngine.readMemory(entry.memory_uid)}
				/>
			</SectionShell>
		</div>
	);
}

export default defineComponent(SystemRAMMonitor, {
	name: 'system_ram_monitor',
	slug: 'system-ram-monitor',
	react_behavior: 'system_ram_monitor',
});