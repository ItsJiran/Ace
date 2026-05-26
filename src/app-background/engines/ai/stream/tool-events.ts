import { AIThreadStreamMethods } from '#/shared/schemas/ai';

import type { EmitRecord, NextProtocolSeq } from './types';
import resolveToolDisplayName from './resolve-tool-display-name';

export function createToolEventController(input: {
	threadUid: string;
	runId: string;
	nextSeq: NextProtocolSeq;
	emit: EmitRecord;
}) {
	const { threadUid, runId, nextSeq, emit } = input;
	const activeToolStreamIds = new Map<string, string>();

	const withRunMetadata = (metadata?: Record<string, unknown>): Record<string, unknown> => ({
		...(metadata ?? {}),
		run_id:
			typeof metadata?.run_id === 'string' && metadata.run_id.trim() ? metadata.run_id : runId,
	});

	return {
		emit(
			event: 'tool-start' | 'tool-stream' | 'tool-finish' | 'tool-error',
			eventData: Record<string, unknown>,
			node?: string,
			metadata?: Record<string, unknown>,
		) {
			const toolIdentity = [node ?? '', resolveToolDisplayName(eventData, node)].join('::');
			const toolStreamUid =
				event === 'tool-start'
					? `${threadUid}:${runId}:tool:${nextSeq()}`
					: activeToolStreamIds.get(toolIdentity) ?? `${threadUid}:${runId}:tool:${nextSeq()}`;

			if (event === 'tool-start') {
				activeToolStreamIds.set(toolIdentity, toolStreamUid);
			} else if (event === 'tool-finish' || event === 'tool-error') {
				activeToolStreamIds.delete(toolIdentity);
			}

			const seq = nextSeq();
			// TOOL events travel through `system:ai:thread:stream`, then are queued by the desktop
			// transport in `use-ai-chat-thread.stream.ts` and consumed by the LangGraph client-facing UI.
			emit({
				type: 'event',
				event_id: `${threadUid}:${runId}:${seq}`,
				seq,
				method: AIThreadStreamMethods.TOOL,
				params: {
					namespace: [],
					timestamp: Date.now(),
					data: {
						event,
						raw_payload: eventData,
						metadata: withRunMetadata(metadata),
						tool_event_stream_uid: toolStreamUid,
						tool_name: resolveToolDisplayName(eventData, node),
						input: eventData.input ?? null,
						stream: eventData.stream ?? eventData.chunk ?? null,
						output: eventData.output ?? null,
						error: eventData.error ?? null,
					},
				},
			});
		},
	};
}

export default createToolEventController;