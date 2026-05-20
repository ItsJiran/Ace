import { ExternalLink, Search } from 'lucide-react';

import { MetaGrid } from './tool-renderer-shared';
import { asRecord, parseStructuredValue } from './tool-renderer.utils';
import type { ToolRendererProps } from './tool-renderer.utils';
import { ToolGenericRenderer } from './tool-generic-renderer';

function resolveSearchResults(value: unknown) {
	const normalizedValue = parseStructuredValue(value);
	if (!Array.isArray(normalizedValue)) {
		return [] as Array<Record<string, unknown>>;
	}

	return normalizedValue
		.map((item) => asRecord(item))
		.filter((item): item is Record<string, unknown> => {
			if (!item) {
				return false;
			}

			return typeof item.title === 'string' || typeof item.link === 'string' || typeof item.snippet === 'string';
		});
}

export function ToolDuckDuckGoRenderer(props: ToolRendererProps) {
	const searchResults = resolveSearchResults(props.content).length > 0 ? resolveSearchResults(props.content) : resolveSearchResults(props.artifact);
	if (searchResults.length === 0) {
		return <ToolGenericRenderer {...props} />;
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="rounded-[18px] border border-white/10 bg-black/15 p-3">
				<div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
					<Search size={13} />
					<span>DuckDuckGo Results</span>
				</div>
				<MetaGrid
					items={[
						{ label: 'Tool', value: props.toolName },
						{ label: 'Result Count', value: String(searchResults.length) },
					]}
				/>
				<div className="mt-3 flex flex-col gap-3">
					{searchResults.map((result, index) => {
						const title = typeof result.title === 'string' ? result.title : `Result ${index + 1}`;
						const link = typeof result.link === 'string' ? result.link : null;
						const snippet = typeof result.snippet === 'string' ? result.snippet : null;

						return (
							<div
								key={`${title}-${link ?? index}`}
								className="rounded-2xl border border-white/10 bg-zinc-950/75 p-3"
							>
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="min-w-0 flex-1">
										<div className="text-sm font-medium text-zinc-100">{title}</div>
										{snippet ? (
											<div className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-400">
												{snippet}
											</div>
										) : null}
									</div>
									{link ? (
										<a
											href={link}
											target="_blank"
											rel="noreferrer"
											className="inline-flex items-center gap-2 rounded-2xl border border-sky-300/15 bg-sky-500/10 px-3 py-1 text-[11px] font-medium text-sky-100"
										>
											<ExternalLink size={12} />
											Open
										</a>
									) : null}
								</div>
								{link ? (
									<div className="mt-3 break-all rounded-2xl border border-white/10 bg-black/20 px-3 py-2 font-mono text-[11px] text-zinc-400">
										{link}
									</div>
								) : null}
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
