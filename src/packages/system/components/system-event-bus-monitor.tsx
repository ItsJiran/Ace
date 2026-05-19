import { Radio } from 'lucide-react';

import { RenderCounterBadge } from '#/app-desktop/components/dev/render-counter-badge';
import { defineComponent } from '#/lib/define-registry';

import { useRuntimeMonitorSnapshots } from './system-runtime-monitor-data';
import {
	SectionShell,
	SummaryCard,
} from './system-runtime-monitor-shared';

function SystemEventBusMonitor() {
	const { eventStream, recentEvents } = useRuntimeMonitorSnapshots();

	return (
		<div className="flex h-full min-h-0 flex-col gap-4 p-4 text-zinc-100">
			<RenderCounterBadge componentName="system-event-bus-monitor" />

			<section className="system-shell-primary rounded-2xl p-5 flex items-start justify-between gap-4">
				<div>
					<div className="text-xs uppercase tracking-[0.24em] text-zinc-500">Event Bus Monitor</div>
					<div className="mt-2 text-2xl font-semibold text-zinc-100">Recent Runtime Signal Feed</div>
					<div className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
						Watch the in-memory event stream to verify config updates, keybind dispatches, process notifications, and any other signals crossing the runtime.
					</div>
				</div>
				<div className="grid min-w-[420px] grid-cols-2 gap-3">
					<SummaryCard
						title="Captured Events"
						value={String(eventStream.length)}
						description="Total events captured in the in-memory stream."
						icon={Radio}
					/>
					<SummaryCard
						title="Recent Feed"
						value={String(recentEvents.length)}
						description="Entries shown in this focused event timeline."
						icon={Radio}
					/>
					<SummaryCard
						title="Newest Slug"
						value={recentEvents[0]?.slug ?? '-'}
						description="Most recently captured event slug in the current snapshot."
						icon={Radio}
					/>
					<SummaryCard
						title="Unique Slugs"
						value={String(new Set(eventStream.map((entry) => entry.slug)).size)}
						description="Distinct event slugs observed in the retained stream."
						icon={Radio}
					/>
				</div>
			</section>

			<SectionShell
				title="Recent Event Timeline"
				description="Latest emitted events from the runtime event bus, rendered as raw payloads so you can inspect exact signal shape."
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
	);
}

export default defineComponent(SystemEventBusMonitor, {
	name: 'system_event_bus_monitor',
	slug: 'system-event-bus-monitor',
	react_behavior: 'system_event_bus_monitor',
});