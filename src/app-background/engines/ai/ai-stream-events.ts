import { AIThreadStreamMethods } from '#/shared/schemas/ai';
import {
	createAssistantMessageController,
	createToolEventController,
	createWorkflowStepController,
	type EmitProtocolThreadEvent,
	isWorkflowNodeName,
	resolveStreamTextContent,
} from './stream';

export function createAIStreamEventBridge(input: {
	threadUid: string;
	runId: string;
	emitProtocolThreadEvent: EmitProtocolThreadEvent;
}) {
	const { threadUid, runId, emitProtocolThreadEvent } = input;
	let protocolSeq = 0;

	const emit = (message: Record<string, unknown>) => {
		emitProtocolThreadEvent(threadUid, message);
	};
	const nextSeq = () => ++protocolSeq;
	const assistantMessages = createAssistantMessageController({
		threadUid,
		runId,
		nextSeq,
		emit,
	});
	const workflowSteps = createWorkflowStepController({
		threadUid,
		runId,
		nextSeq,
		emit,
	});
	const toolEvents = createToolEventController({
		threadUid,
		runId,
		nextSeq,
		emit,
	});

	const emitLifecycle = (event: 'started' | 'completed' | 'failed', error?: string) => {
		emit({
			type: 'event',
			event_id: `${threadUid}:${runId}:${nextSeq()}`,
			seq: protocolSeq,
			method: AIThreadStreamMethods.LIFECYCLE,
			params: {
				namespace: [],
				timestamp: Date.now(),
				data: {
					event,
					...(error ? { error } : {}),
				},
			},
		});
	};


	return {
		start() {
			emitLifecycle('started');
		},
		complete() {
			assistantMessages.finish();
			emitLifecycle('completed');
		},
		fail(error: unknown) {
			assistantMessages.finish();
			workflowSteps.finishAll();
			emitLifecycle('failed', error instanceof Error ? error.message : String(error));
		},
		process(event: unknown) {
			const eventRecord = event as Record<string, unknown>;
			const eventName = typeof eventRecord.event === 'string' ? eventRecord.event : '';
			const eventMethod = typeof eventRecord.method === 'string' ? eventRecord.method : '';
			const eventData =
				eventRecord.data && typeof eventRecord.data === 'object'
					? (eventRecord.data as Record<string, unknown>)
					: {};
			const eventParams =
				eventRecord.params && typeof eventRecord.params === 'object'
					? (eventRecord.params as Record<string, unknown>)
					: undefined;
			const protocolData =
				eventParams?.data && typeof eventParams.data === 'object'
					? (eventParams.data as Record<string, unknown>)
					: undefined;
			const node = typeof eventRecord.name === 'string' ? eventRecord.name : undefined;
			const metadata =
				typeof eventRecord.metadata === 'object' && eventRecord.metadata
					? (eventRecord.metadata as Record<string, unknown>)
					: undefined;

			if ((eventName === 'on_chain_start' || eventName === 'on_chain_end') && isWorkflowNodeName(node)) {
				workflowSteps.emit(eventName === 'on_chain_start' ? 'start' : 'finish', node);
				return;
			}

			if (eventMethod === 'tools' && protocolData) {
				const normalizedToolData: Record<string, unknown> = {
					name: protocolData.tool_name,
					tool_name: protocolData.tool_name,
					input: protocolData.input ?? null,
					output: protocolData.output ?? null,
					error: protocolData.error ?? protocolData.message ?? null,
				};

				if (protocolData.event === 'tool-started') {
					toolEvents.emit('tool-start', normalizedToolData, node, metadata);
					return;
				}

				if (protocolData.event === 'tool-finished') {
					toolEvents.emit('tool-finish', normalizedToolData, node, metadata);
					return;
				}

				if (protocolData.event === 'tool-error') {
					toolEvents.emit('tool-error', normalizedToolData, node, metadata);
				}
				return;
			}

			if (eventName === 'on_chat_model_start') {
				assistantMessages.ensureStarted(node, metadata);
				return;
			}

			if (eventName === 'on_chat_model_stream') {
				const chunk = eventData.chunk as Record<string, unknown> | undefined;
				assistantMessages.emitTextDelta(resolveStreamTextContent(chunk?.content), node, metadata);
				return;
			}

			if (eventName === 'on_chat_model_end') {
				const finalOutput =
					resolveStreamTextContent(eventData.output) ||
					resolveStreamTextContent((eventData.chunk as Record<string, unknown> | undefined)?.content);

				if (finalOutput && !assistantMessages.hasText()) {
					assistantMessages.emitTextDelta(finalOutput, node, metadata);
				}

				assistantMessages.finish(node);
				return;
			}

			if (eventName === 'on_tool_start') {
				toolEvents.emit('tool-start', eventData, node, metadata);
				return;
			}

			if (eventName === 'on_tool_end') {
				toolEvents.emit('tool-finish', eventData, node, metadata);
				return;
			}

			if (eventName === 'on_tool_error') {
				toolEvents.emit('tool-error', eventData, node, metadata);
			}
		},
	};
}