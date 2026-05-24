import { Cpu } from 'lucide-react';

import { RenderCounterBadge } from '#/app-desktop/components/dev/render-counter-badge';
import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';
import { defineComponent } from '#/lib/define-registry';

import { useRuntimeMonitorSnapshots } from './system-runtime-monitor-data';
import {
	SectionShell,
	SummaryCard,
} from './system-runtime-monitor-shared';

function SystemProcessMonitor() {
	const { processCount, processRecords, recentProcesses } = useRuntimeMonitorSnapshots();
	const { targets } = useAceTheme();

	return (
		<div className="flex h-full min-h-0 flex-col gap-4 p-4 text-zinc-100">
			<RenderCounterBadge componentName="system-process-monitor" />

			<section className={[targets.shell.first, 'rounded-2xl p-5 flex flex-col items-start justify-between gap-4'].join(' ')}>
				<div>
					<div className="text-xs uppercase tracking-[0.24em] text-zinc-500">Process Monitor</div>
					<div className="mt-2 text-2xl font-semibold">Active Kernel Process View</div>
					<div className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
						Inspect lifecycle state, engine ownership, and parent-child linkage for recently updated processes. This is the fastest way to spot stuck engine flows.
					</div>
				</div>
				<div className="grid min-w-[420px] grid-cols-4 gap-3">
					<SummaryCard
						title="Processes"
						value={String(processCount)}
						description="Tracked kernel processes in the current snapshot."
						icon={Cpu}
					/>
					<SummaryCard
						title="Recent Rows"
						value={String(recentProcesses.length)}
						description="Process cards shown in this focused view."
						icon={Cpu}
					/>
					<SummaryCard
						title="Completed"
						value={String(processRecords.filter((item) => item.lifecycle_state === 'done').length)}
						description="Processes currently marked as completed."
						icon={Cpu}
					/>
					<SummaryCard
						title="Running"
						value={String(processRecords.filter((item) => item.lifecycle_state === 'running').length)}
						description="Processes currently marked as running."
						icon={Cpu}
					/>
				</div>
			</section>

			<SectionShell
				title="Recent Process Records"
				description="Sorted by update timestamp so the newest process activity stays at the top while debugging runtime orchestration."
				icon={Cpu}
			>
				<div className="min-h-0 flex-1 overflow-auto space-y-2 pr-1">
					{recentProcesses.length === 0 ? (
						<div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-500">No processes recorded yet.</div>
					) : null}
					{recentProcesses.map((processRecord) => (
						<div key={processRecord.process_uid} className={[targets.container.third, 'rounded-2xl px-4 py-3'].join(' ')}>
							<div className="flex items-center justify-between gap-3">
								<div className="font-mono text-[11px] text-zinc-200">{processRecord.process_uid}</div>
								<div className={[targets.container.first, 'rounded-full px-2 py-1 text-[10px] uppercase tracking-wide'].join(' ')}>{processRecord.lifecycle_state ?? processRecord.status}</div>
							</div>
							<div className="mt-2 text-sm font-medium text-zinc-100">{processRecord.type}</div>
							<div className="mt-1 text-xs text-zinc-500">owner_engine: {processRecord.owner_engine ?? '-'}</div>
							<div className="text-xs text-zinc-500">parent: {processRecord.parent_process_uid ?? '-'}</div>
							<div className="text-xs text-zinc-500">updated: {new Date(processRecord.updated_at).toLocaleTimeString()}</div>
						</div>
					))}
				</div>
			</SectionShell>
		</div>
	);
}

export default defineComponent(SystemProcessMonitor, {
	name: 'system_process_monitor',
	slug: 'system-process-monitor',
	react_behavior: 'system_process_monitor',
});