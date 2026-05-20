import { Braces, LayoutPanelTop, MonitorSmartphone, Move, ScanSearch, Waypoints } from 'lucide-react';

import { MetaGrid, ToolSection } from './tool-renderer-shared';
import { asArray, asRecord, parseStructuredValue } from './tool-renderer.utils';
import type { ToolRendererProps } from './tool-renderer.utils';
import { ToolGenericRenderer } from './tool-generic-renderer';

function resolveWindowItems(value: unknown) {
	const normalizedValue = parseStructuredValue(value);
	if (Array.isArray(normalizedValue)) {
		return normalizedValue.map((item) => asRecord(item)).filter((item): item is Record<string, unknown> => Boolean(item));
	}

	const record = asRecord(normalizedValue);
	if (!record) {
		return [] as Record<string, unknown>[];
	}

	const windows = asArray(record.windows);
	if (windows.length > 0) {
		return windows.map((item) => asRecord(item)).filter((item): item is Record<string, unknown> => Boolean(item));
	}

	return [record];
}

export function ToolWindowRenderer(props: ToolRendererProps) {
	const toolAction = typeof props.record.action === 'string' ? props.record.action : null;
	const windowItems = resolveWindowItems(props.artifact).length > 0 ? resolveWindowItems(props.artifact) : resolveWindowItems(props.content);
	if (windowItems.length === 0) {
		return <ToolGenericRenderer {...props} />;
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="rounded-[18px] border border-white/10 bg-black/15 p-3">
				<div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
					<LayoutPanelTop size={13} />
					<span>Window Result</span>
				</div>
				<MetaGrid
					items={[
						{ label: 'Action', value: toolAction },
						{ label: 'Window Count', value: String(windowItems.length) },
					]}
				/>
				<div className="grid gap-3 xl:grid-cols-2">
					{windowItems.map((windowItem, index) => (
						<div key={`${String(windowItem.window_uid || windowItem.title || index)}`} className="rounded-2xl border border-white/10 bg-zinc-950/75 p-3">
							<div className="mb-3 flex flex-wrap items-center gap-2">
								{typeof windowItem.window_uid === 'string' ? (
									<span className="inline-flex items-center gap-2 rounded-2xl border border-sky-300/15 bg-sky-500/10 px-3 py-1 text-[11px] font-medium text-sky-100">
										<ScanSearch size={13} />
										{windowItem.window_uid}
									</span>
								) : null}
								{typeof windowItem.title === 'string' ? (
									<span className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-1 text-[11px] text-zinc-200">
										<Waypoints size={13} />
										{windowItem.title}
									</span>
								) : null}
							</div>
							<MetaGrid
								items={[
									{ label: 'Window UID', value: typeof windowItem.window_uid === 'string' ? windowItem.window_uid : null },
									{ label: 'Title', value: typeof windowItem.title === 'string' ? windowItem.title : null },
									{ label: 'Package', value: typeof windowItem.package === 'string' ? windowItem.package : null },
									{ label: 'Component', value: typeof windowItem.component === 'string' ? windowItem.component : null },
									{ label: 'State', value: typeof windowItem.state === 'string' ? windowItem.state : null },
									{ label: 'Focused', value: typeof windowItem.is_focused === 'boolean' ? String(windowItem.is_focused) : null },
									{ label: 'Minimized', value: typeof windowItem.is_minimized === 'boolean' ? String(windowItem.is_minimized) : null },
									{ label: 'Locked', value: typeof windowItem.is_locked === 'boolean' ? String(windowItem.is_locked) : null },
									{ label: 'Resizeable', value: typeof windowItem.is_resizeable === 'boolean' ? String(windowItem.is_resizeable) : null },
									{ label: 'Always On Top', value: typeof windowItem.always_on_top === 'boolean' ? String(windowItem.always_on_top) : null },
									{ label: 'Opacity', value: windowItem.opacity != null ? String(windowItem.opacity) : null },
									{ label: 'Position', value: windowItem.x != null || windowItem.y != null ? `${windowItem.x ?? '-'}, ${windowItem.y ?? '-'}` : null },
									{ label: 'Size', value: windowItem.width != null || windowItem.height != null ? `${windowItem.width ?? '-'} x ${windowItem.height ?? '-'}` : null },
								]}
							/>
							{windowItem.x != null || windowItem.y != null || windowItem.width != null || windowItem.height != null ? (
								<div className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">
									<div className="mb-2 flex items-center gap-2 uppercase tracking-[0.22em] text-zinc-500">
										<Move size={12} />
										Bounds
									</div>
									<div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
										<div>x: {String(windowItem.x ?? '-')}</div>
										<div>y: {String(windowItem.y ?? '-')}</div>
										<div>w: {String(windowItem.width ?? '-')}</div>
										<div>h: {String(windowItem.height ?? '-')}</div>
									</div>
								</div>
							) : null}
						</div>
					))}
				</div>
			</div>

			<ToolSection title="Window Output" icon={MonitorSmartphone} value={props.content} />
			<ToolSection title="Window Artifact" icon={Braces} value={props.artifact} />
		</div>
	);
}