import { AIThreadStreamMethods } from '#/shared/schemas/ai';

import type { EmitRecord, NextProtocolSeq } from './types';

export function createAssistantMessageController(input: {
	threadUid: string;
	runId: string;
	nextSeq: NextProtocolSeq;
	emit: EmitRecord;
}) {
	const { threadUid, runId, nextSeq, emit } = input;
	let activeAssistantMessageId: string | null = null;
	let activeAssistantText = '';
	let hasStartedAssistantBlock = false;

	const ensureStarted = (node?: string, metadata?: Record<string, unknown>) => {
		if (!activeAssistantMessageId) {
			activeAssistantMessageId = `assistant:${threadUid}:${runId}`;
			const seq = nextSeq();
			emit({
				type: 'event',
				event_id: `${threadUid}:${runId}:${seq}`,
				seq,
				method: AIThreadStreamMethods.MESSAGES,
				params: {
					namespace: [],
					timestamp: Date.now(),
					...(node ? { node } : {}),
					data: {
						event: 'message-start',
						role: 'ai',
						id: activeAssistantMessageId,
						...(metadata ? { metadata } : {}),
					},
				},
			});
		}

		if (!hasStartedAssistantBlock) {
			hasStartedAssistantBlock = true;
			const seq = nextSeq();
			emit({
				type: 'event',
				event_id: `${threadUid}:${runId}:${seq}`,
				seq,
				method: AIThreadStreamMethods.MESSAGES,
				params: {
					namespace: [],
					timestamp: Date.now(),
					...(node ? { node } : {}),
					data: {
						event: 'content-block-start',
						index: 0,
						content: {
							type: 'text',
							text: '',
						},
					},
				},
			});
		}
	};

	return {
		ensureStarted,
		emitTextDelta(text: string, node?: string, metadata?: Record<string, unknown>) {
			if (!text) {
				return;
			}

			ensureStarted(node, metadata);
			activeAssistantText += text;
			const seq = nextSeq();
			emit({
				type: 'event',
				event_id: `${threadUid}:${runId}:${seq}`,
				seq,
				method: AIThreadStreamMethods.MESSAGES,
				params: {
					namespace: [],
					timestamp: Date.now(),
					...(node ? { node } : {}),
					data: {
						event: 'content-block-delta',
						index: 0,
						delta: {
							type: 'text-delta',
							text,
						},
					},
				},
			});
		},
		finish(node?: string) {
			if (!activeAssistantMessageId || !hasStartedAssistantBlock) {
				return;
			}

			const contentFinishSeq = nextSeq();
			emit({
				type: 'event',
				event_id: `${threadUid}:${runId}:${contentFinishSeq}`,
				seq: contentFinishSeq,
				method: AIThreadStreamMethods.MESSAGES,
				params: {
					namespace: [],
					timestamp: Date.now(),
					...(node ? { node } : {}),
					data: {
						event: 'content-block-finish',
						index: 0,
						content: {
							type: 'text',
							text: activeAssistantText,
						},
					},
				},
			});

			const messageFinishSeq = nextSeq();
			emit({
				type: 'event',
				event_id: `${threadUid}:${runId}:${messageFinishSeq}`,
				seq: messageFinishSeq,
				method: AIThreadStreamMethods.MESSAGES,
				params: {
					namespace: [],
					timestamp: Date.now(),
					...(node ? { node } : {}),
					data: {
						event: 'message-finish',
						reason: 'stop',
					},
				},
			});

			activeAssistantMessageId = null;
			activeAssistantText = '';
			hasStartedAssistantBlock = false;
		},
		hasText() {
			return activeAssistantText.length > 0;
		},
	};
}

export default createAssistantMessageController;