import { Fragment, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';

function stringifyMemoryValue(value: unknown) {
	if (typeof value === 'string') {
		return value;
	}

	if (value === undefined) {
		return 'undefined';
	}

	if (value === null) {
		return 'null';
	}

	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
		return String(value);
	}

	if (typeof value === 'function') {
		return `[function ${value.name || 'anonymous'}]`;
	}

	if (value instanceof Map) {
		return JSON.stringify(Array.from(value.entries()), null, 2);
	}

	if (value instanceof Set) {
		return JSON.stringify(Array.from(value.values()), null, 2);
	}

	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return Object.prototype.toString.call(value);
	}
}

type MemoryTableColumn<TEntry> = {
	header: string;
	className?: string;
	render: (entry: TEntry) => ReactNode;
};

type SystemMemoryTableProps<TEntry extends { memory_uid: string }> = {
	entries: TEntry[];
	columns: MemoryTableColumn<TEntry>[];
	emptyMessage: string;
	resolveExpandedValue: (entry: TEntry) => unknown;
	resolveExpandedTitle?: (entry: TEntry) => string;
};

export function SystemMemoryTable<TEntry extends { memory_uid: string }>({
	entries,
	columns,
	emptyMessage,
	resolveExpandedValue,
	resolveExpandedTitle,
}: SystemMemoryTableProps<TEntry>) {
	const [expandedMemoryUid, setExpandedMemoryUid] = useState<string | null>(null);
	const { targets } = useAceTheme();

	return (
		<div className="min-h-0 flex-1 overflow-auto rounded-2xl">
			<table className="min-w-full text-left text-xs text-zinc-300">
				<thead className={[targets.container.second, 'sticky top-0 z-10'].join(' ')}>
					<tr>
						<th className="w-10 px-3 py-2 font-medium" aria-hidden />
						{columns.map((column) => (
							<th key={column.header} className={[ 'px-3 py-2 font-medium', column.className || '' ].join(' ')}>
								{column.header}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{entries.length === 0 ? (
						<tr className={[targets.container.first, 'align-top'].join(' ')}>
							<td colSpan={columns.length + 1} className="px-3 py-6 text-center text-zinc-500">
								{emptyMessage}
							</td>
						</tr>
					) : null}

					{entries.map((entry) => {
						const isExpanded = expandedMemoryUid === entry.memory_uid;
						const expandedTitle = resolveExpandedTitle?.(entry) ?? entry.memory_uid;
						const expandedValue = resolveExpandedValue(entry);

						return (
							<Fragment key={entry.memory_uid}>
								<tr className={[targets.container.first, 'align-top'].join(' ')}>
									<td className="px-3 py-2 align-top">
										<button
											type="button"
											onClick={() => setExpandedMemoryUid(isExpanded ? null : entry.memory_uid)}
											className={[targets.btn.first, 'inline-flex h-7 w-7 items-center justify-center'].join(' ')}
											aria-label={isExpanded ? 'Collapse memory entry' : 'Expand memory entry'}
										>
											<ChevronDown
												size={14}
												className={isExpanded ? 'rotate-180 transition-transform' : 'transition-transform'}
											/>
										</button>
									</td>
									{columns.map((column) => (
										<td key={column.header} className={[ 'px-3 py-2 align-top', column.className || '' ].join(' ')}>
											{column.render(entry)}
										</td>
									))}
								</tr>

								{isExpanded ? (
									<tr className={targets.container.first}>
										<td colSpan={columns.length + 1} className="px-4 pb-4 pt-1">
											<div className="rounded-2xl border border-white/10 bg-black/20 p-4">
												<div className="mb-3 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
													{expandedTitle}
												</div>
												<pre className="overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-zinc-950/80 p-4 font-mono text-[11px] leading-5 text-zinc-300">
													{stringifyMemoryValue(expandedValue)}
												</pre>
											</div>
										</td>
									</tr>
								) : null}
							</Fragment>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}