import { AIThreadStreamMethods } from '#/shared/schemas/ai';
import {
	AgentStreamEventNames,
	createWorkflowStepController,
	extractAgentStreamEvent,
	type EmitProtocolThreadEvent,
	type AgentStreamEvent,
	type KnownAgentStreamEventName,
} from './stream';

type LifecycleEvent = 'started' | 'completed' | 'failed';

type StreamEventHandler = (event: AgentStreamEvent) => void;

// Keep protocol sequence monotonic per thread across runs.
// The desktop stream subscription can stay open for multiple prompts on the same thread,
// so resetting `seq` on each run can cause later events to be ignored by consumers that
// expect increasing sequence numbers.
const threadProtocolSeqByThreadUid = new Map<string, number>();

/**
 * Bridges raw LangGraph stream events into the desktop thread protocol.
 *
 * Purpose: keep all transport shaping for thread runs in one place so each agent event can
 * later be customized independently without reopening the thread engine.
 */
export function createAIStreamEventBridge(input: {
	threadUid: string;
	runId: string;
	emitProtocolThreadEvent: EmitProtocolThreadEvent;
}) {
	const { threadUid, runId, emitProtocolThreadEvent } = input;
	console.info('[AIStreamBridge] created', { threadUid, runId });
	let protocolSeq = threadProtocolSeqByThreadUid.get(threadUid) ?? 0;
	const nextSeq = () => {
		// `seq` is the ordering cursor for one thread's protocol stream.
		// Goal:
		// 1) Preserve strict event order for UI consumers.
		// 2) Keep ordering stable across multiple runs in the same thread session.
		// 3) Help clients detect stale/out-of-order packets when retries or buffering happen.
		protocolSeq += 1;
		threadProtocolSeqByThreadUid.set(threadUid, protocolSeq);
		return protocolSeq;
	};

	const resolveRunId = (metadata?: Record<string, unknown>) =>
		typeof metadata?.run_id === 'string' && metadata.run_id.trim()
			? metadata.run_id
			: runId;

	const withRunMetadata = (metadata?: Record<string, unknown>): Record<string, unknown> => ({
		...(metadata ?? {}),
		run_id: resolveRunId(metadata),
	});

	const emit = (message: Record<string, unknown>) => {
		// All emitted protocol events leave background through `emitProtocolThreadEvent`, then land in
		// the desktop `EventBus.listen(AI_THREAD_STREAM_EVENT_SLUG, ...)` listeners.
		// From there:
		// - `LIFECYCLE`, `MESSAGES`, `TOOL`, and `STEP` are handled centrally by `AgentClientEngine`
		//   to update thread kernel memory and dedupe protocol packets.
		// - `MESSAGES`, `TOOL`, and `STEP` are queued by `use-ai-chat-thread.stream.ts` for the
		//   LangGraph client transport used by the chat UI.
		emitProtocolThreadEvent(threadUid, message);
	};

	const workflowSteps = createWorkflowStepController({ threadUid, runId, nextSeq, emit });

	const emitLifecycle = (
		event: LifecycleEvent,
		error?: string,
		rawPayload?: unknown,
		metadata?: Record<string, unknown>,
	) => {
		const seq = nextSeq();
		// Lifecycle events are the lightweight control channel. On the client they are handled by
		// `AgentClientEngine` to toggle waiting state in kernel memory and trigger thread resync on finish/fail.
		emit({
			type: 'event',
			event_id: `${threadUid}:${runId}:${seq}`,
			seq,
			method: AIThreadStreamMethods.LIFECYCLE,
			params: {
				namespace: [],
				timestamp: Date.now(),
				data: {
					event,
					raw_payload: rawPayload,
					metadata: withRunMetadata(metadata),
					...(error ? { error } : {}),
				},
			},
		});
	};

	const finishAssistantMessage = () => {
		// Intentionally no-op for now; message finalization will be implemented manually.
	};
	const handleUpdatesEvent: StreamEventHandler = () => {
		// Intentionally no-op for manual implementation.
	};

	const handleMessagesMethodEvent: StreamEventHandler = () => {
		// Intentionally no-op for manual implementation.
	};

	const handleChatModelStream: StreamEventHandler = () => {
		// Intentionally no-op for manual implementation.
	};

	const handleToolStart: StreamEventHandler = () => {
		// Intentionally no-op for manual implementation.
	};

	const handleToolStream: StreamEventHandler = () => {
		// Intentionally no-op for manual implementation.
	};

	const handleToolEnd: StreamEventHandler = () => {
		// Intentionally no-op for manual implementation.
	};

	const handleToolError: StreamEventHandler = () => {
		// Intentionally no-op for manual implementation.
	};

	const handleChainStart: StreamEventHandler = () => {
		// Intentionally no-op for manual implementation.
	};

	const handleChainEnd: StreamEventHandler = () => {
		// Intentionally no-op for manual implementation.
	};

	const handleChainError: StreamEventHandler = () => {
		// Intentionally no-op for manual implementation.
	};

	const handleProtocolToolEvent: StreamEventHandler = () => {
		// Intentionally no-op for manual implementation.
	};

	const streamEventHandlers: Partial<Record<KnownAgentStreamEventName, StreamEventHandler>> = {
		// Chat model events are the core of the assistant message stream, so we handle them directly 
		// in this bridge to keep the message flow stable and responsive.
		[AgentStreamEventNames.CHAT_MODEL_STREAM]: handleChatModelStream,

		// Tool events are emitted for all nodes with tool calls, but the payload is currently only 
		// shaped for protocol-level tools.
		[AgentStreamEventNames.TOOL_START]: handleToolStart,
		[AgentStreamEventNames.TOOL_STREAM]: handleToolStream,
		[AgentStreamEventNames.TOOL_END]: handleToolEnd,
		[AgentStreamEventNames.TOOL_ERROR]: handleToolError,

		// We currently emit chain events for all nodes, but only treat nodes with known workflow step names as steps in the frontend protocol. 
		// This allows flexibility in how we model agent execution while keeping the client-side step surface stable.
		[AgentStreamEventNames.CHAIN_START]: handleChainStart,
		[AgentStreamEventNames.CHAIN_END]: handleChainEnd,
		[AgentStreamEventNames.CHAIN_ERROR]: handleChainError,
	};

	return {
		start() {
			console.info('[AIStreamBridge] lifecycle start', {
				threadUid,
				runId,
				meta_run_id: runId,
			});
			// Thread lifecycle starts before the first agent event so UI can switch into streaming mode immediately.
			emitLifecycle('started', undefined, { type: 'lifecycle', event: 'started' }, { run_id: runId });
		},
		complete() {
			console.info('[AIStreamBridge] lifecycle complete', {
				threadUid,
				runId,
				meta_run_id: runId,
			});
			finishAssistantMessage();
			workflowSteps.finishAll();
			emitLifecycle('completed', undefined, { type: 'lifecycle', event: 'completed' }, { run_id: runId });
		},
		fail(error: unknown) {
			console.error('[AIStreamBridge] lifecycle fail', {
				threadUid,
				runId,
				meta_run_id: runId,
				error: error instanceof Error ? error.message : String(error),
			});
			finishAssistantMessage();
			workflowSteps.finishAll();
			emitLifecycle(
				'failed',
				error instanceof Error ? error.message : String(error),
				{ type: 'lifecycle', event: 'failed', error: error instanceof Error ? error.message : String(error) },
				{ run_id: runId },
			);
		},
		process(event: unknown) {


			
			// // Every raw agent event is normalized once, then dispatched to a dedicated handler.
			// const { eventName, eventMethod, eventData, protocolData, node, metadata, rawPayload } =
			// 	extractAgentStreamEvent(event);
			// const metaRunId = resolveRunId(metadata);
				
			// const streamEvent: AgentStreamEvent = {
			// 	eventName,
			// 	eventMethod,
			// 	eventData,
			// 	protocolData,
			// 	node,
			// 	metadata,
			// 	rawPayload,
			// 	eventParams: undefined,
			// };
			// console.info('[AIStreamBridge] raw event', { event });
			// console.info('[AIStreamBridge] stream event', {
			// 	threadUid,
			// 	runId,
			// 	meta_run_id: metaRunId,
			// 	eventName,
			// 	eventMethod,
			// 	resolvedNode: node ?? metadata?.langgraph_node ?? metadata?.node,
			// 	eventDataKeys: Object.keys(eventData),
			// });

			// if (eventMethod === 'messages' || eventName === 'on_messages') {
			// 	handleMessagesMethodEvent(streamEvent);
			// 	return;
			// }

			// if (eventMethod === 'tools' && protocolData) {
			// 	console.info('[AIStreamBridge] protocol tool event', {
			// 		threadUid,
			// 		runId,
			// 		meta_run_id: metaRunId,
			// 		node,
			// 	});
			// 	handleProtocolToolEvent(streamEvent);
			// 	return;
			// }

			// if (eventMethod === 'updates' || eventName === 'on_updates') {
			// 	handleUpdatesEvent(streamEvent);
			// 	return;
			// }

			// streamEventHandlers[eventName as KnownAgentStreamEventName]?.(streamEvent);
		},
	};
}