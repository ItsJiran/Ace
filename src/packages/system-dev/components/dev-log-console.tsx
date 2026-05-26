import { useEffect, useMemo, useState, type UIEvent } from 'react';
import { defineComponent } from '#/lib/define-registry';
import { DeferredWindowContent } from '#/app-desktop/components/layout/deferred-window-content';
import { useAceMemory } from '#/app-desktop/hooks/use-ace-memory';
import { LoggerEngine, type LogEntry } from '#/app-desktop/engines/logger-engine';

const INITIAL_RENDER_COUNT = 40;
const RENDER_CHUNK_COUNT = 24;

function resolveLevelClass(level: LogEntry['level']) {
	if (level === 'error') return 'text-red-300';
	if (level === 'warn') return 'text-amber-300';
	if (level === 'info') return 'text-cyan-300';
	return 'text-zinc-300';
}

function DevLogConsole() {
	const logs = useAceMemory<LogEntry[]>(LoggerEngine.logsMemoryUid) ?? [];
	const sortedLogs = useMemo(() => [...logs].sort((a, b) => b.timestamp - a.timestamp), [logs]);
	const [visibleCount, setVisibleCount] = useState(INITIAL_RENDER_COUNT);

	useEffect(() => {
		setVisibleCount((current) => {
			if (current >= sortedLogs.length) {
				return current;
			}

			return Math.min(sortedLogs.length, current + 1);
		});
	}, [sortedLogs.length]);

	const visibleLogs = useMemo(
		() => sortedLogs.slice(0, visibleCount),
		[sortedLogs, visibleCount],
	);

	const handleScroll = (event: UIEvent<HTMLDivElement>) => {
		const node = event.currentTarget;
		const remaining = node.scrollHeight - (node.scrollTop + node.clientHeight);
		if (remaining > 180) {
			return;
		}

		setVisibleCount((current) => Math.min(sortedLogs.length, current + RENDER_CHUNK_COUNT));
	};

	return (
		<DeferredWindowContent fallback={<div className="text-zinc-500 font-mono text-xs">Loading Logs...</div>}>
			<div className="flex h-full min-h-0 flex-col gap-3 p-3">
				<div className="rounded-sm border border-white/10 bg-black/20 px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
					Desktop + Background Console Stream ({visibleLogs.length}/{sortedLogs.length})
				</div>

				<div
					onScroll={handleScroll}
					className="min-h-0 flex-1 overflow-y-auto rounded-sm border border-white/10 bg-zinc-950/60 p-3"
				>
					{sortedLogs.length === 0 ? (
						<div className="text-zinc-500 font-mono text-xs">No logs captured yet.</div>
					) : (
						visibleLogs.map((entry) => (
							<div key={entry.id} className="mb-2 rounded-sm border border-white/10 bg-black/20 px-3 py-2">
								<div className="mb-1 flex items-center gap-2 font-mono text-[11px]">
									<span className="text-zinc-500">
										{new Date(entry.timestamp).toLocaleTimeString([], {
											hour12: false,
											hour: '2-digit',
											minute: '2-digit',
											second: '2-digit',
										})}
									</span>
									<span className={resolveLevelClass(entry.level)}>{entry.level.toUpperCase()}</span>
									<span className="rounded bg-zinc-800/80 px-2 py-0.5 text-[10px] text-zinc-300">
										{entry.source}
									</span>
								</div>
								<pre className="overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-zinc-300">
									{entry.message}
								</pre>
							</div>
						))
					)}

					{visibleLogs.length < sortedLogs.length ? (
						<div className="mt-2 text-center font-mono text-[11px] text-zinc-500">
							Scroll down to load more logs...
						</div>
					) : null}
				</div>
			</div>
		</DeferredWindowContent>
	);
}

export default defineComponent(DevLogConsole, {
	name: 'dev_log_console',
	slug: 'dev-log-console',
	react_behavior: 'dev_log_console',
});
