import { AlertTriangle, Braces, Hammer, Info } from 'lucide-react';

import { MetaGrid, ToolSection } from './tool-renderer-shared';
import { asRecord, parseStructuredValue, type ToolRendererProps } from './tool-renderer.utils';

function resolveErrorPayload(content: unknown, artifact: unknown, record: Record<string, unknown>) {
	const structuredContent = parseStructuredValue(content);
	const structuredArtifact = parseStructuredValue(artifact);
	const structuredRecord = parseStructuredValue(record);

	const contentRecord = asRecord(structuredContent);
	const artifactRecord = asRecord(structuredArtifact);
	const recordRecord = asRecord(structuredRecord);

	return {
		message:
			(typeof contentRecord?.error === 'string' && contentRecord.error) ||
			(typeof contentRecord?.message === 'string' && contentRecord.message) ||
			(typeof artifactRecord?.error === 'string' && artifactRecord.error) ||
			(typeof artifactRecord?.message === 'string' && artifactRecord.message) ||
			(typeof recordRecord?.error === 'string' && recordRecord.error) ||
			(typeof recordRecord?.message === 'string' && recordRecord.message) ||
			(typeof content === 'string' ? content : ''),
		stderr:
			contentRecord?.stderr ?? artifactRecord?.stderr ?? recordRecord?.stderr ?? null,
		stdout:
			contentRecord?.stdout ?? artifactRecord?.stdout ?? recordRecord?.stdout ?? null,
		details: structuredArtifact && structuredArtifact !== artifact ? structuredArtifact : structuredContent,
	};
}

export function ToolErrorRenderer({ toolName, content, artifact, record }: ToolRendererProps) {
	const errorPayload = resolveErrorPayload(content, artifact, record);

	return (
		<div className="flex flex-col gap-3">
			<div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-red-100">
				<div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-red-200/80">
					<AlertTriangle size={14} />
					Tool Error
				</div>
				<div className="mt-2 text-sm leading-6 text-red-50 whitespace-pre-wrap break-words">
					{errorPayload.message || `${toolName} failed.`}
				</div>
			</div>

			<MetaGrid
				items={[
					{ label: 'Tool', value: toolName },
					{ label: 'Status', value: typeof record.status === 'string' ? record.status : 'error' },
					{ label: 'Call ID', value: typeof record.tool_call_id === 'string' ? record.tool_call_id : null },
				]}
			/>

			<ToolSection title="stderr" icon={Info} value={errorPayload.stderr} />
			<ToolSection title="stdout" icon={Hammer} value={errorPayload.stdout} />
			<ToolSection title="Structured Detail" icon={Braces} value={errorPayload.details} />
		</div>
	);
}

export default ToolErrorRenderer;