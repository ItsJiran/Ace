import type { ReactNode } from 'react';
import { Cpu, Database } from 'lucide-react';

export function SummaryCard({
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
					<div className="text-xs uppercase tracking-[0.24em]">{title}</div>
					<div className="mt-2 text-2xl font-semibold">{value}</div>
					<div className="mt-1 text-xs leading-5">{description}</div>
				</div>
				<div className="rounded-2xl system-btn-primary  p-3">
					<Icon size={18} />
				</div>
			</div>
		</div>
	);
}

export function SectionShell({
	title,
	description,
	icon: Icon,
	children,
}: {
	title: string;
	description: string;
	icon: typeof Database | typeof Cpu;
	children: ReactNode;
}) {
	return (
		<section className="system-shell-primary rounded-2xl p-4 flex min-h-0 flex-col gap-4 overflow-hidden">
			<div className="flex items-start gap-3">
				<div className="rounded-2xl system-btn-secondary p-3">
					<Icon size={18} />
				</div>
				<div>
					<div className="text-lg font-semibold">{title}</div>
					<div className="mt-1 text-sm leading-6 text-zinc-500">{description}</div>
				</div>
			</div>
			{children}
		</section>
	);
}