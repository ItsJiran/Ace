import { AIThreadStreamMethods } from '#/shared/schemas/ai';
import {
	AgentStreamEventNames,
	createToolEventController,
	createWorkflowStepController,
	extractAgentStreamEvent,
	isWorkflowNodeName,
	type EmitProtocolThreadEvent,
	type AgentStreamEvent,
	type KnownAgentStreamEventName,
	resolveStreamTextContent,
} from './stream';

type LifecycleEvent = 'started' | 'completed' | 'failed';
type MessageStreamEventName =
	| 'message-start'
	| 'content-block-start'
	| 'token'
	| 'content-block-delta'
	| 'content-block-finish'
	| 'message-finish';

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

	let activeAssistantMessageId: string | null = null;
	let activeAssistantText = '';
	let hasStartedAssistantBlock = false;

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

	
	const toolEvents = createToolEventController({ threadUid, runId, nextSeq, emit });
	const workflowSteps = createWorkflowStepController({ threadUid, runId, nextSeq, emit });

	const emitLifecycle = (event: LifecycleEvent, error?: string) => {
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
					...(error ? { error } : {}),
				},
			},
		});
	};

	const emitMessageEvent = (
		event: MessageStreamEventName,
		data: Record<string, unknown>,
		node?: string,
		metadata?: Record<string, unknown>,
	) => {
		const seq = nextSeq();
		// Message events do not stop in the lifecycle hook. They continue into
		// `use-ai-chat-thread.stream.ts`, get pushed into the per-thread async queue, and are then read
		// by the LangGraph-compatible transport that feeds the desktop chat message UI.
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
					event,
					...data,
					...(metadata ? { metadata } : {}),
				},
			},
		});
	};

	const ensureAssistantMessageStarted = (
		node?: string,
		metadata?: Record<string, unknown>,
	) => {
		if (!activeAssistantMessageId) {
			activeAssistantMessageId = `assistant:${threadUid}:${runId}`;
			// Announces that one assistant message envelope has started, so the frontend can
			// create a stable message record before any streamed content arrives.
			emitMessageEvent(
				'message-start',
				{
					role: 'ai',
					id: activeAssistantMessageId,
				},
				node,
				metadata,
			);
		}

		if (!hasStartedAssistantBlock) {
			hasStartedAssistantBlock = true;
			// Opens the first content block for this assistant message. We currently stream a
			// single text block, so this marks the block container before token deltas append into it.
			emitMessageEvent(
				'content-block-start',
				{
					index: 0,
					content: {
						type: 'text',
						text: '',
					},
				},
				node,
				metadata,
			);
		}
	};

	const emitAssistantToken = (
		text: string,
		node?: string,
		metadata?: Record<string, unknown>,
	) => {
		if (!text) {
			return;
		}

		ensureAssistantMessageStarted(node, metadata);
		activeAssistantText += text;

		// Emits the raw token chunk itself. This is the lowest-level text stream event and is the
		// right place for future token-by-token UI behavior such as live cursors or token metrics.
		emitMessageEvent(
			'token',
			{
				role: 'ai',
				id: activeAssistantMessageId,
				text,
			},
			node,
			metadata,
		);

		// Emits the protocol-compatible text delta so existing message renderers can keep building
		// the visible assistant content incrementally without depending on the raw token event.
		emitMessageEvent(
			'content-block-delta',
			{
				index: 0,
				delta: {
					type: 'text-delta',
					text,
				},
			},
			node,
			metadata,
		);
	};

	const finishAssistantMessage = (node?: string) => {
		if (!activeAssistantMessageId || !hasStartedAssistantBlock) {
			return;
		}

		// Closes the active text block with the fully accumulated assistant text so consumers that
		// care about block finalization receive the completed payload in one event.
		emitMessageEvent('content-block-finish', {
			index: 0,
			content: {
				type: 'text',
				text: activeAssistantText,
			},
		}, node);

		// Marks the assistant message as finished so the frontend can stop appending deltas and treat
		// the message as complete for this run.
		emitMessageEvent(
			'message-finish',
			{
				reason: 'stop',
				id: activeAssistantMessageId,
			},
			node,
		);

		activeAssistantMessageId = null;
		activeAssistantText = '';
		hasStartedAssistantBlock = false;
	};

	const handleChatModelStart: StreamEventHandler = ({ node, metadata }) => {
		// Chat model start marks the beginning of the assistant response envelope.
		ensureAssistantMessageStarted(node, metadata);
	};

	const handleChatModelStream: StreamEventHandler = ({ eventData, node, metadata }) => {
		// Per-token deltas are emitted here so UI can observe streaming granularity directly.
		const chunk = eventData.chunk as Record<string, unknown> | undefined;
		emitAssistantToken(resolveStreamTextContent(chunk?.content), node, metadata);
	};

	const handleChatModelEnd: StreamEventHandler = ({ eventData, node, metadata }) => {
		// Some providers only surface the final text at the end event, so backfill once if needed.
		const finalOutput =
			resolveStreamTextContent(eventData.output) ||
			resolveStreamTextContent((eventData.chunk as Record<string, unknown> | undefined)?.content);

		if (finalOutput && !activeAssistantText) {
			emitAssistantToken(finalOutput, node, metadata);
		}

		finishAssistantMessage(node);
	};

	const handleToolStart: StreamEventHandler = ({ eventData, node, metadata }) => {
		// Tool start emits a stable tool stream id so the client can correlate the full tool lifecycle
		// after the event crosses the EventBus -> transport queue -> LangGraph UI pipeline.
		toolEvents.emit('tool-start', eventData, node, metadata);
	};

	const handleToolStream: StreamEventHandler = ({ eventData, node, metadata }) => {
		// Tool stream carries mid-flight tool progress chunks. It follows the same client path as other
		// non-lifecycle events: EventBus -> `use-ai-chat-thread.stream.ts` queue -> LangGraph UI consumer.
		toolEvents.emit('tool-stream', eventData, node, metadata);
	};

	const handleToolEnd: StreamEventHandler = ({ eventData, node, metadata }) => {
		// Tool finish closes the correlated tool event stream on the client side.
		toolEvents.emit('tool-finish', eventData, node, metadata);
	};

	const handleToolError: StreamEventHandler = ({ eventData, node, metadata }) => {
		// Tool error reaches the same tool-rendering pipeline, but marks that tool stream as failed.
		toolEvents.emit('tool-error', eventData, node, metadata);
	};

	const handleChainStart: StreamEventHandler = ({ node }) => {
		// Workflow steps are only emitted for nodes we explicitly model in the frontend protocol.
		// On the client they travel through the transport queue, where the chat UI can surface run phases.
		if (!isWorkflowNodeName(node)) {
			return;
		}

		workflowSteps.emit('start', node);
	};

	const handleChainEnd: StreamEventHandler = ({ node }) => {
		if (!isWorkflowNodeName(node)) {
			return;
		}

		workflowSteps.emit('finish', node);
	};

	const handleChainError: StreamEventHandler = ({ node }) => {
		if (!isWorkflowNodeName(node)) {
			return;
		}

		workflowSteps.emit('finish', node);
	};

	const handleProtocolToolEvent: StreamEventHandler = ({ protocolData }) => {
		// Placeholder for custom protocol-level tool events forwarded through the stream.
		// Keep this handler explicit so future protocol-only events have a single extension point.
		void protocolData;
	};

	const streamEventHandlers: Partial<Record<KnownAgentStreamEventName, StreamEventHandler>> = {
		// Chat model events are the core of the assistant message stream, so we handle them directly 
		// in this bridge to keep the message flow stable and responsive.
		[AgentStreamEventNames.CHAT_MODEL_START]: handleChatModelStart,
		[AgentStreamEventNames.CHAT_MODEL_STREAM]: handleChatModelStream,
		[AgentStreamEventNames.CHAT_MODEL_END]: handleChatModelEnd,

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
			// Thread lifecycle starts before the first agent event so UI can switch into streaming mode immediately.
			emitLifecycle('started');
		},
		complete() {
			finishAssistantMessage();
			// workflowSteps.finishAll();
			emitLifecycle('completed');
		},
		fail(error: unknown) {
			finishAssistantMessage();
			// workflowSteps.finishAll();
			emitLifecycle('failed', error instanceof Error ? error.message : String(error));
		},
		process(event: unknown) {
			// Every raw agent event is normalized once, then dispatched to a dedicated handler.
			const { eventName, eventMethod, eventData, protocolData, node, metadata } =
				extractAgentStreamEvent(event);
				
			const streamEvent: AgentStreamEvent = {
				eventName,
				eventMethod,
				eventData,
				protocolData,
				node,
				metadata,
				eventParams: undefined,
			};

			if (eventMethod === 'tools' && protocolData) {
				handleProtocolToolEvent(streamEvent);
				return;
			}

			streamEventHandlers[eventName as KnownAgentStreamEventName]?.(streamEvent);
		},
	};
}