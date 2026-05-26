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
};

/**
 * Extracts and normalises all relevant fields from a raw LangGraph stream event into a
 * typed `AgentStreamEvent`, so callers never have to repeat the same defensive casts.
 */
export function extractAgentStreamEvent(event: unknown): AgentStreamEvent {
	const rec = event as Record<string, unknown>;

	const eventName = typeof rec.event === 'string' ? rec.event : '';
	const eventMethod = typeof rec.method === 'string' ? rec.method : '';

	const eventData =
		rec.data && typeof rec.data === 'object' ? (rec.data as Record<string, unknown>) : {};

	const eventParams =
		rec.params && typeof rec.params === 'object'
			? (rec.params as Record<string, unknown>)
			: undefined;

	const protocolData =
		eventParams?.data && typeof eventParams.data === 'object'
			? (eventParams.data as Record<string, unknown>)
			: undefined;

	const node = typeof rec.name === 'string' ? rec.name : undefined;

	const metadata =
		rec.metadata && typeof rec.metadata === 'object'
			? (rec.metadata as Record<string, unknown>)
			: undefined;

	return { eventName, eventMethod, eventData, eventParams, protocolData, node, metadata };
}
