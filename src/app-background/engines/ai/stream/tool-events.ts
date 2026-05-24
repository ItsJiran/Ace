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

	return {
		emit(
			event: 'tool-start' | 'tool-finish' | 'tool-error',
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
			} else {
				activeToolStreamIds.delete(toolIdentity);
			}

			const seq = nextSeq();
			emit({
				type: 'event',
				event_id: `${threadUid}:${runId}:${seq}`,
				seq,
				method: AIThreadStreamMethods.TOOL,
				params: {
					namespace: [],
					timestamp: Date.now(),
					...(node ? { node } : {}),
					data: {
						event,
						tool_event_stream_uid: toolStreamUid,
						tool_name: resolveToolDisplayName(eventData, node),
						input: eventData.input ?? null,
						output: eventData.output ?? null,
						error: eventData.error ?? null,
						...(metadata ? { metadata } : {}),
					},
				},
			});
		},
	};
}

export default createToolEventController;