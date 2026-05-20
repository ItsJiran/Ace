import { Wrench } from 'lucide-react';
import { ToolMessage } from '@langchain/core/messages';
import { ToolPayloadRenderer } from './tools/tool-payload-renderer';

export function SystemAIChatToolMessage({ message }: { message: ToolMessage }) {
	const toolRecord = message as unknown as Record<string, unknown>;
	const toolName =
		typeof toolRecord.name === 'string'
			? toolRecord.name
			: typeof toolRecord.tool_name === 'string'
				? toolRecord.tool_name
				: 'tool';
	const toolCallId = typeof toolRecord.tool_call_id === 'string' ? toolRecord.tool_call_id : null;
	const status = typeof toolRecord.status === 'string' ? toolRecord.status : null;
	const artifact = toolRecord.artifact;

	return (
		<div className="flex w-full flex-col gap-3 text-zinc-500">
			<div className="mb-1 flex flex-wrap items-center gap-2">
				<span className="inline-flex items-center gap-2 rounded-2xl system-container-primary py-2 text-xs px-3">
					<Wrench size={13} />
					{toolName}
				</span>
				{toolCallId ? (
					<span className="rounded-2xl system-container-primary py-2 text-xs px-3">
						call: {toolCallId}
					</span>
				) : null}
				{status ? (
					<span className="rounded-2xl system-container-primary py-2 text-xs px-3">
						{status}
					</span>
				) : null}
			</div>

			<ToolPayloadRenderer
				toolName={toolName}
				content={message.content}
				artifact={artifact}
				record={toolRecord}
			/>
		</div>
	);
}