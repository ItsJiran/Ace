import { useEffect, useState } from 'react';

import { AgentClientEngine } from '#/app-desktop/engines/agent-client-engine';
import { EventBus } from '#/shared/engines/event-engine';
import {
	AIThreadStreamMethods,
	AI_THREAD_STREAM_EVENT_SLUG,
	type AgentThread,
	type AIThreadLifecycleEventData,
	type AIThreadLifecycleEventType,
	type AIThreadMessageEventData,
	type AIThreadMessageEventType,
	type AIThreadMessagesMessage,
	type AIThreadStepEventData,
	type AIThreadStepEventType,
	type AIThreadStepMessage,
	type AIThreadToolEventData,
	type AIThreadToolEventType,
	type AIThreadToolMessage,
	type BackgroundAIStreamEventPayloadType,
	resolveAIThreadStreamProtocolMessage,
} from '#/shared/schemas/ai';
import { resolveActiveThreadUid } from '#/app-desktop/hooks/use-ai-chat-thread.stream';

export function useAIChatThreadEvents(input: {
	threadUid: string | null;
	onThreadSynced?: (thread: AgentThread | null) => void;
}) {
	const { threadUid, onThreadSynced } = input;
	const [is_waiting_for_backend_run, setIsWaitingForBackendRun] = useState(false);

	const clearStreamState = () => {
		setIsWaitingForBackendRun(false);
	};

	const markRunRequested = () => {
		setIsWaitingForBackendRun(true);
	};

	const syncThreadFromBackground = (nextThreadUid: string) => {
		void AgentClientEngine.syncCurrentThreadFromBackground(nextThreadUid).then((thread) => {
			onThreadSynced?.(thread ?? null);
		});
	};

	const lifecycleHandlers: Record<
		AIThreadLifecycleEventType,
		(data: AIThreadLifecycleEventData, nextThreadUid: string) => void
	> = {
		started: () => {
			setIsWaitingForBackendRun(true);
		},
		completed: (_data, nextThreadUid) => {
			setIsWaitingForBackendRun(false);
			syncThreadFromBackground(nextThreadUid);
		},
		failed: (_data, nextThreadUid) => {
			setIsWaitingForBackendRun(false);
			syncThreadFromBackground(nextThreadUid);
		},
	};

	const messageEventHandlers: Record<AIThreadMessageEventType, (data: AIThreadMessageEventData) => void> = {
		'message-start': (_data) => {
			// Message events are consumed mainly by the LangGraph transport queue.
			// This hook keeps an explicit handler map so client-side side effects can be added per event later.
		},
		'content-block-start': (_data) => {},
		'token': (_data) => {},
		'content-block-delta': (_data) => {},
		'content-block-finish': (_data) => {},
		'message-finish': (_data) => {},
	};

	const toolEventHandlers: Record<AIThreadToolEventType, (data: AIThreadToolEventData) => void> = {
		'tool-start': (_data) => {
			// Tool lifecycle events share the same transport path as message events.
			// Keep the handler surface explicit here so desktop-only reactions can be attached later.
		},
		'tool-stream': (_data) => {},
		'tool-finish': (_data) => {},
		'tool-error': (_data) => {},
	};

	const stepEventHandlers: Record<AIThreadStepEventType, (data: AIThreadStepEventData) => void> = {
		start: (_data) => {},
		finish: (_data) => {},
	};

	const handleLifecycleMessage = (message: Extract<ReturnType<typeof resolveAIThreadStreamProtocolMessage>, { method: typeof AIThreadStreamMethods.LIFECYCLE }>, nextThreadUid: string) => {
		lifecycleHandlers[message.params.data.event](message.params.data, nextThreadUid);
	};

	const handleMessagesMessage = (message: AIThreadMessagesMessage) => {
		messageEventHandlers[message.params.data.event](message.params.data);
	};

	const handleToolMessage = (message: AIThreadToolMessage) => {
		toolEventHandlers[message.params.data.event](message.params.data);
	};

	const handleStepMessage = (message: AIThreadStepMessage) => {
		stepEventHandlers[message.params.data.event](message.params.data);
	};

	useEffect(() => {
		if (!threadUid) {
			clearStreamState();
			return;
		}

		return EventBus.listen<BackgroundAIStreamEventPayloadType>(
			AI_THREAD_STREAM_EVENT_SLUG,
			(event) => {
				const payload = event?.payload;
				if (!payload) {
					return;
				}

				const observedThreadUid = resolveActiveThreadUid(threadUid);
				if (!observedThreadUid || payload.thread_uid !== observedThreadUid) {
					return;
				}

				const message = resolveAIThreadStreamProtocolMessage(payload.message);
				if (!message) {
					return;
				}

				if (message.method === AIThreadStreamMethods.LIFECYCLE) {
					handleLifecycleMessage(message, payload.thread_uid);
					return;
				}

				if (message.method === AIThreadStreamMethods.MESSAGES) {
					handleMessagesMessage(message);
					return;
				}

				if (message.method === AIThreadStreamMethods.TOOL) {
					handleToolMessage(message);
					return;
				}

				if (message.method === AIThreadStreamMethods.STEP) {
					handleStepMessage(message);
				}
			},
		);
	}, [threadUid, onThreadSynced]);

	return {
		is_waiting_for_backend_run,
		markRunRequested,
		clearStreamState,
	};
}

export default useAIChatThreadEvents;