import { WorkflowNodeNames } from '#/shared/schemas/ai';

/**
 * Represents a single event emitted by the LangGraph agent during streaming.
 * Field names mirror the LangGraph `streamEvents` protocol surface.
 */
export const AgentStreamEventNames = {
	CHAT_MODEL_START: 'on_chat_model_start',
	CHAT_MODEL_STREAM: 'on_chat_model_stream',
	CHAT_MODEL_END: 'on_chat_model_end',
	TOOL_START: 'on_tool_start',
	TOOL_STREAM: 'on_tool_stream',
	TOOL_END: 'on_tool_end',
	TOOL_ERROR: 'on_tool_error',
	CHAIN_START: 'on_chain_start',
	CHAIN_END: 'on_chain_end',
	CHAIN_ERROR: 'on_chain_error',
} as const;

export type KnownAgentStreamEventName =
	(typeof AgentStreamEventNames)[keyof typeof AgentStreamEventNames];

export type AgentStreamEvent = {
	/** LangGraph event name, e.g. `on_chat_model_start`, `on_chat_model_stream`, `on_tool_start`. */
	eventName: KnownAgentStreamEventName | string;

	/** Protocol method from custom protocol events forwarded through the stream (e.g. `tools`). */
	eventMethod: string;

	/** Data payload carried by the event. */
	eventData: Record<string, unknown>;

	/**
	 * Optional protocol-level params block, present on events forwarded through the custom
	 * event protocol (i.e. when `method` is set on the raw event record).
	 */
	eventParams: Record<string, unknown> | undefined;

	/**
	 * Inner `data` field of `eventParams`. Useful for custom protocol events where the
	 * actual payload is nested under `params.data`.
	 */
	protocolData: Record<string, unknown> | undefined;

	/** LangGraph node name (from the `name` field on the raw event record). */
	node: string | undefined;

	/** LangGraph metadata block attached to the event. */
	metadata: Record<string, unknown> | undefined;

	/** Raw stream payload before normalization. */
	rawPayload: unknown;
};

function resolveString(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined;
	}

	const normalized = value.trim();
	return normalized ? normalized : undefined;
}

function resolveRecord(value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}

	return value as Record<string, unknown>;
}

function resolveEventData(rec: Record<string, unknown>, eventParams?: Record<string, unknown>) {
	const candidates = [
		resolveRecord(rec.data),
		resolveRecord(rec.payload),
		resolveRecord(rec.value),
		resolveRecord(rec.output),
		resolveRecord(rec.chunk),
		resolveRecord(rec.input),
		resolveRecord(eventParams?.data),
	];

	for (const candidate of candidates) {
		if (!candidate) {
			continue;
		}

		if (Object.keys(candidate).length > 0) {
			return candidate;
		}
	}

	return candidates.find(Boolean) ?? {};
}

function resolveFirstNodeKey(eventData: Record<string, unknown>): string | undefined {
	const [firstKey] = Object.keys(eventData);
	if (!firstKey || firstKey === '__end__' || firstKey === '__interrupt__') {
		return undefined;
	}

	return firstKey;
}

function normalizeWorkflowNode(value: unknown): string | undefined {
	const raw = resolveString(value);
	if (!raw) {
		return undefined;
	}

	const firstSegment = raw.split(/[.:/]/)[0]?.trim();
	if (!firstSegment) {
		return undefined;
	}

	return firstSegment === WorkflowNodeNames.AGENT ||
		firstSegment === WorkflowNodeNames.REASONING ||
		firstSegment === WorkflowNodeNames.ROUTER ||
		firstSegment === WorkflowNodeNames.ORCHESTRATOR ||
		firstSegment === WorkflowNodeNames.EXECUTOR ||
		firstSegment === WorkflowNodeNames.OBSERVE
		? firstSegment
		: undefined;
}

function resolveUpdatesWorkflowNode(eventData: Record<string, unknown>): string | undefined {
	for (const key of Object.keys(eventData)) {
		if (key === '__end__' || key === '__interrupt__') {
			continue;
		}

		const normalized = normalizeWorkflowNode(key);
		if (normalized) {
			return normalized;
		}
	}

	return normalizeWorkflowNode(resolveFirstNodeKey(eventData));
}

/**
 * Extracts and normalises all relevant fields from a raw LangGraph stream event into a
 * typed `AgentStreamEvent`, so callers never have to repeat the same defensive casts.
 */
export function extractAgentStreamEvent(event: unknown): AgentStreamEvent {
	const rec = event as Record<string, unknown>;
	const eventNameFromRecord = resolveString(rec.event);
	const eventMethod = resolveString(rec.method) ?? '';

	const eventParams =
		rec.params && typeof rec.params === 'object'
			? (rec.params as Record<string, unknown>)
			: undefined;

	const eventData = resolveEventData(rec, eventParams);

	const protocolData =
		eventParams?.data && typeof eventParams.data === 'object'
			? (eventParams.data as Record<string, unknown>)
			: undefined;

	const metadata =
		rec.metadata && typeof rec.metadata === 'object'
			? (rec.metadata as Record<string, unknown>)
			: undefined;

	const eventName = eventNameFromRecord ?? (eventMethod ? `on_${eventMethod}` : 'unknown');
	const nodeFromCandidates =
		normalizeWorkflowNode(rec.name) ??
		normalizeWorkflowNode(rec.node) ??
		normalizeWorkflowNode(eventParams?.node) ??
		normalizeWorkflowNode(eventData.node) ??
		normalizeWorkflowNode(eventData.langgraph_node) ??
		normalizeWorkflowNode(metadata?.langgraph_node) ??
		normalizeWorkflowNode(metadata?.node);

	const node =
		nodeFromCandidates ??
		(eventMethod === 'updates' ? resolveUpdatesWorkflowNode(eventData) : undefined);

	return {
		eventName,
		eventMethod,
		eventData,
		eventParams,
		protocolData,
		node,
		metadata,
		rawPayload: event,
	};
}
