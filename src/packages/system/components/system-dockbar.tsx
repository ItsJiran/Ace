import { useMemo, useState } from 'react';
import {
	Activity,
	AppWindow,
	ChevronUp,
	Cpu,
	MemoryStick,
	MessageSquareText,
	Power,
	RadioTower,
	Settings2,
} from 'lucide-react';

import { useAceMemory } from '#/app-desktop/hooks/use-ace-memory';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import type { WindowConfig } from '#/shared/schemas/window';
import { defineComponent } from '#/lib/define-registry';

type WindowSystemEntry = {
	window_uid: string;
	process_uid: string;
	component: string;
	memory_uid?: string;
};

type DockbarWindowEntry = {
	window_uid: string;
	title: string;
	isMinimized: boolean;
	isFocused: boolean;
	component: string;
};

const launcherButtonClass =
	'inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/25 text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white';

const menuItems = [
	{
		label: 'System Settings',
		icon: Settings2,
		spawn: () =>
			window.ACE.window.spawnWindow({
				package: 'itsjiran/ace-system',
				window: 'system-settings-window',
				title: 'System Settings',
				width: 1024,
				height: 760,
				x: 360,
				y: 90,
			}),
	},
	{
		label: 'RAM Monitor',
		icon: MemoryStick,
		spawn: () =>
			window.ACE.window.spawnWindow({
				package: 'itsjiran/ace-system',
				window: 'system-ram-monitor-window',
				title: 'Kernel RAM Monitor',
				width: 1120,
				height: 740,
				x: 360,
				y: 100,
			}),
	},
	{
		label: 'Process Monitor',
		icon: Cpu,
		spawn: () =>
			window.ACE.window.spawnWindow({
				package: 'itsjiran/ace-system',
				window: 'system-process-monitor-window',
				title: 'Process Monitor',
				width: 1120,
				height: 740,
				x: 380,
				y: 110,
			}),
	},
	{
		label: 'Event Bus Monitor',
		icon: RadioTower,
		spawn: () =>
			window.ACE.window.spawnWindow({
				package: 'itsjiran/ace-system',
				window: 'system-event-bus-monitor-window',
				title: 'Event Bus Monitor',
				width: 1120,
				height: 740,
				x: 400,
				y: 120,
			}),
	},
];

function resolveWindowEntries(
	windowSystem: Map<string, WindowSystemEntry> | undefined,
	focusedWindowUid: string | null | undefined,
) {
	if (!windowSystem) {
		return [] as DockbarWindowEntry[];
	}

	return Array.from(windowSystem.values())
		.map((entry) => {
			const config = KernelEngine.readMemory(`system:window:${entry.window_uid}`) as
				| WindowConfig
				| undefined;
			if (!config) {
				return null;
			}

			if (config.component === 'itsjiran/ace-system:windows:system-dockbar-window') {
				return null;
			}

			return {
				window_uid: entry.window_uid,
				title: config.title || entry.component.split(':').at(-1) || entry.window_uid,
				isMinimized: config.is_minimized,
				isFocused: focusedWindowUid === entry.window_uid,
				component: config.component,
			};
		})
		.filter((entry): entry is DockbarWindowEntry => Boolean(entry))
		.sort((left, right) => Number(right.isFocused) - Number(left.isFocused));
}

function SystemDockbar() {
	const [isMenuOpen, setIsMenuOpen] = useState(false);
	const windowSystem = useAceMemory<Map<string, WindowSystemEntry>>('system:window_system');
	const focusedWindowUid = useAceMemory<string | null>('system:global_state:focused_window');

	const windows = useMemo(
		() => resolveWindowEntries(windowSystem, focusedWindowUid),
		[focusedWindowUid, windowSystem],
	);

	const spawnChatWindow = () => {
		window.ACE.window.spawnWindow({
			package: 'itsjiran/ace-system',
			window: 'system-ai-chat-window',
			title: 'ACE Chat',
			width: 780,
			height: 660,
			x: 430,
			y: 100,
		});
	};

	return (
		<div className="relative flex h-full w-full items-center gap-3 overflow-visible rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(24,24,27,0.95),rgba(9,9,11,0.92))] px-4 py-3 text-zinc-100 shadow-[0_20px_48px_rgba(0,0,0,0.35)] backdrop-blur-xl">
			<div className="flex shrink-0 items-center gap-2">
				<button
					type="button"
					onClick={spawnChatWindow}
					className={launcherButtonClass}
					aria-label="Open ACE Chat"
					title="ACE Chat"
				>
					<MessageSquareText size={18} />
				</button>

				<div className="relative">
					<button
						type="button"
						onClick={() => setIsMenuOpen((current) => !current)}
						className={launcherButtonClass}
						aria-label="Open system menu"
						title="System Menu"
					>
						<ChevronUp size={18} className={isMenuOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
					</button>

					{isMenuOpen ? (
						<div className="absolute bottom-[calc(100%+12px)] left-0 z-20 min-w-[240px] overflow-hidden rounded-[22px] border border-white/10 bg-zinc-950/96 p-2 shadow-[0_24px_50px_rgba(0,0,0,0.45)] backdrop-blur-xl">
							<div className="px-3 pb-2 pt-1 text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-500">
								System Surfaces
							</div>
							<div className="flex flex-col gap-1">
								{menuItems.map((item) => {
									const Icon = item.icon;
									return (
										<button
											key={item.label}
											type="button"
											onClick={() => {
												item.spawn();
												setIsMenuOpen(false);
											}}
											className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm text-zinc-200 transition hover:bg-white/[0.08] hover:text-white"
										>
											<Icon size={16} className="text-zinc-400" />
											<span>{item.label}</span>
										</button>
									);
								})}
							</div>
						</div>
					) : null}
				</div>
			</div>

			<div className="min-w-0 flex-1">
				<div className="mb-2 flex items-center gap-2 px-1 text-[11px] font-medium uppercase tracking-[0.24em] text-zinc-500">
					<AppWindow size={12} />
					<span>Active Windows</span>
				</div>
				<div className="flex min-w-0 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
					{windows.length === 0 ? (
						<div className="rounded-2xl border border-dashed border-white/10 px-4 py-2 text-sm text-zinc-500">
							No active windows yet
						</div>
					) : null}

					{windows.map((entry) => (
						<button
							key={entry.window_uid}
							type="button"
							onClick={() => {
								if (entry.isMinimized) {
									window.ACE.window.restoreWindow(entry.window_uid);
									return;
								}

								window.ACE.window.focusWindow(entry.window_uid);
							}}
							className={[
								'group min-w-0 shrink-0 rounded-2xl border px-4 py-2 text-left transition',
								entry.isFocused
									? 'border-emerald-300/35 bg-emerald-400/[0.14] text-emerald-50'
									: 'border-white/10 bg-white/[0.04] text-zinc-200 hover:border-white/20 hover:bg-white/[0.08] hover:text-white',
							].join(' ')}
							title={entry.component}
						>
							<div className="truncate text-sm font-medium">{entry.title}</div>
							<div className="mt-1 text-xs text-zinc-500 group-hover:text-zinc-400">
								{entry.isMinimized ? 'minimized' : entry.window_uid}
							</div>
						</button>
					))}
				</div>
			</div>

			<div className="flex shrink-0 items-center gap-2">
				<div className="hidden rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-400 md:flex md:items-center md:gap-2">
					<Activity size={14} className="text-emerald-300" />
					<span>{windows.length} windows</span>
				</div>

				<button
					type="button"
					onClick={() => void window.electronAPI?.quitApp()}
					className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-red-400/20 bg-red-500/[0.12] text-red-200 transition hover:border-red-300/40 hover:bg-red-500/[0.2] hover:text-red-50"
					aria-label="Shutdown ACE"
					title="Shutdown ACE"
				>
					<Power size={18} />
				</button>
			</div>
		</div>
	);
}

export default defineComponent(SystemDockbar, {
	name: 'system_dockbar',
	slug: 'system-dockbar',
	react_behavior: 'system_dockbar',
});