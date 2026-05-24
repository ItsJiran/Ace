import type { ReactNode } from 'react';
import { Cpu, Database } from 'lucide-react';

import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';

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
	const { targets } = useAceTheme();

	return (
		<div className={[targets.container.third, 'rounded-2xl px-4 py-3'].join(' ')}>
			<div className="flex items-start justify-between gap-3">
				<div>
					<div className="text-xs uppercase tracking-[0.24em]">{title}</div>
					<div className="mt-2 text-2xl font-semibold">{value}</div>
					<div className="mt-1 text-xs leading-5">{description}</div>
				</div>
				<div className={[targets.btn.first, 'rounded-2xl p-3'].join(' ')}>
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
	const { targets } = useAceTheme();

	return (
		<section className={[targets.shell.first, 'rounded-2xl p-4 flex min-h-0 flex-col gap-4 overflow-hidden'].join(' ')}>
			<div className="flex items-start gap-3">
				<div className={[targets.btn.secondary, 'rounded-2xl p-3'].join(' ')}>
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