import { Braces, FileCode2, FolderTree } from 'lucide-react';

import { MetaGrid, StructuredValueBlock, ToolSection } from './tool-renderer-shared';
import { asArray, asRecord, parseStructuredValue } from './tool-renderer.utils';
import type { ToolRendererProps } from './tool-renderer.utils';
import { ToolFilesystemCliRenderer } from './tool-filesystem-cli-renderers';
import { ToolGenericRenderer } from './tool-generic-renderer';

function resolveFilesystemRecord(value: unknown) {
	return asRecord(parseStructuredValue(value));
}

function resolveFilesystemEntries(value: unknown) {
	const normalizedValue = parseStructuredValue(value);
	if (Array.isArray(normalizedValue)) {
		return normalizedValue;
	}

	const record = asRecord(normalizedValue);
	if (!record) {
		return [] as unknown[];
	}

	return asArray(record.entries ?? record.files ?? record.paths ?? record.matches ?? record.results);
}

export function ToolFilesystemRenderer(props: ToolRendererProps) {
	const cliRenderer = ToolFilesystemCliRenderer(props);
	if (cliRenderer) {
		return cliRenderer;
	}

	const filesystemRecord = resolveFilesystemRecord(props.content) ?? resolveFilesystemRecord(props.content);
	const entries =
		resolveFilesystemEntries(props.content).length > 0
			? resolveFilesystemEntries(props.content)
			: resolveFilesystemEntries(props.content);
	if (!filesystemRecord && entries.length === 0) {
		return <ToolGenericRenderer {...props} />;
	}

	const contentPreview = filesystemRecord?.content ?? filesystemRecord?.preview ?? filesystemRecord?.result;

	return (
		<div className="flex flex-col gap-3">
			<MetaGrid
				items={[
					{ label: 'Tool', value: props.name },
					{ label: 'Path', value: typeof filesystemRecord?.path === 'string' ? filesystemRecord.path : null },
					{ label: 'Directory', value: typeof filesystemRecord?.directory === 'string' ? filesystemRecord.directory : null },
					{ label: 'Exists', value: typeof filesystemRecord?.exists === 'boolean' ? String(filesystemRecord.exists) : null },
					{ label: 'Entry Count', value: entries.length ? String(entries.length) : null },
				]}
			/>

			{entries.length > 0 ? (
				<div className="rounded-[18px] border border-white/10 bg-black/15 p-3">
					<div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
						<FolderTree size={13} />
						<span>Filesystem Entries</span>
					</div>
					<div className="flex flex-col gap-2">
						{entries.map((entry, index) => (
							<div key={`${index}-${typeof entry === 'string' ? entry : 'entry'}`} className="rounded-2xl border border-white/10 bg-zinc-950/75 px-3 py-2">
								<StructuredValueBlock value={entry} />
							</div>
						))}
					</div>
				</div>
			) : null}

			<ToolSection title="Content Preview" icon={FileCode2} value={contentPreview} />
			<ToolSection title="Filesystem Output" icon={Braces} value={props.content} />
			<ToolSection title="Filesystem Artifact" icon={Braces} value={props.content} />
		</div>
	);
}