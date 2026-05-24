import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';
import { isPrimitive, parseStructuredValue, stringifyValue } from './tool-renderer.utils';

export function StructuredValueBlock({ value }: { value: unknown }) {
	const { targets } = useAceTheme();
	const normalizedValue = parseStructuredValue(value);

	if (typeof normalizedValue === 'string') {
		return <div className={[targets.container.first, 'p-2 rounded-sm shadow-sm'].join(' ')}><div className="whitespace-pre-wrap break-words bg-zinc-600 text-white/60 py-3 rounded-sm">{normalizedValue}</div></div>;
	}

	if (Array.isArray(normalizedValue) && normalizedValue.every(isPrimitive)) {
		return (
			<div className="flex flex-wrap gap-2 ">
				{normalizedValue.map((item, index) => (
					<span
						key={`${String(item)}-${index}`}
						className="rounded-xl border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-zinc-200"
					>
						{String(item)}
					</span>
					))}
			</div>
		);
	}

	if (
		normalizedValue &&
		typeof normalizedValue === 'object' &&
		!Array.isArray(normalizedValue)
	) {
		const entries = Object.entries(normalizedValue);
		if (entries.length > 0 && entries.every(([, entryValue]) => isPrimitive(entryValue))) {
			return (
				<div className="grid gap-2 sm:grid-cols-2">
					{entries.map(([key, entryValue]) => (
						<div key={key} className="rounded-2xl border border-white/10 bg-black/15 px-3 py-2">
							<div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{key}</div>
							<div className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-100">
								{String(entryValue)}
							</div>
						</div>
					))}
				</div>
			);
		}
	}

	return (
		<pre className="overflow-auto whitespace-pre-wrap break-words rounded-2xl bg-zinc-950/80 p-3 font-mono text-[11px] leading-5 text-zinc-300">
			{stringifyValue(normalizedValue)}
		</pre>
	);
}

export function ToolSection({
	title,
	icon: Icon,
	value,
}: {
	title: string;
	icon: LucideIcon;
	value: unknown;
}) {
	if (value == null || value === '') {
		return null;
	}

	return (
		<div className="rounded-[18px] p-3">
			<div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
				<Icon size={13} />
				<span>{title}</span>
			</div>
			<StructuredValueBlock value={value} />
		</div>
	);
}

export function MetaGrid({
	items,
}: {
	items: Array<{ label: string; value: ReactNode }>;
}) {
	const visibleItems = items.filter((item) => item.value != null && item.value !== '');
	if (visibleItems.length === 0) {
		return null;
	}

	return (
		<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
			{visibleItems.map((item) => (
				<div key={item.label} className="rounded-2xl border border-white/10 bg-black/15 px-3 py-2">
					<div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{item.label}</div>
					<div className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-100">{item.value}</div>
				</div>
			))}
		</div>
	);
}