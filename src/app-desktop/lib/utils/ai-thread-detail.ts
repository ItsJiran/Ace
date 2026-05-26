type SerializedAgentMessage = {
	lc?: number;
	type?: string;
	id?: unknown[];
	kwargs?: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return null;
	}

	return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

export function resolveThreadEnvelope<TPayload>(memoryUid: string, payload: TPayload | undefined) {
	return {
		key: memoryUid,
		value: payload,
	};
}

export function resolveMessageKind(message: SerializedAgentMessage) {
	const idPath = asArray(message.id);
	const lastSegment = idPath.at(-1);

	if (typeof lastSegment === 'string' && lastSegment.endsWith('Message')) {
		return lastSegment.replace(/Message$/, '');
	}

	return typeof lastSegment === 'string' ? lastSegment : 'Message';
}

export function stringifyUnknown(value: unknown) {
	if (typeof value === 'string') {
		return value;
	}

	if (value == null) {
		return '';
	}

	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

export function resolveContentText(content: unknown) {
	if (typeof content === 'string') {
		return content;
	}

	if (!Array.isArray(content)) {
		return stringifyUnknown(content);
	}

	return content
		.map((item) => {
			const record = asRecord(item);
			if (!record) {
				return stringifyUnknown(item);
			}

			if (record.type === 'text' && typeof record.text === 'string') {
				return record.text;
			}

			if (record.type === 'tool_call') {
				return `tool_call: ${String(record.name ?? '-')}`;
			}

			return stringifyUnknown(item);
		})
		.filter(Boolean)
		.join('\n\n');
}

export function resolveToolCalls(message: SerializedAgentMessage) {
	return asArray(message.kwargs?.tool_calls);
}

export function resolveUsage(message: SerializedAgentMessage) {
	return asRecord(message.kwargs?.usage_metadata);
}

export function resolveAdditionalKwargs(message: SerializedAgentMessage) {
	return asRecord(message.kwargs?.additional_kwargs);
}

export function resolveResponseMetadata(message: SerializedAgentMessage) {
	return asRecord(message.kwargs?.response_metadata);
}

export function resolveTokenSummary(messages: SerializedAgentMessage[]) {
	return messages.reduce(
		(summary, message) => {
			const usage = resolveUsage(message);
			return {
				input_tokens: summary.input_tokens + Number(usage?.input_tokens ?? 0),
				output_tokens: summary.output_tokens + Number(usage?.output_tokens ?? 0),
				total_tokens: summary.total_tokens + Number(usage?.total_tokens ?? 0),
			};
		},
		{
			input_tokens: 0,
			output_tokens: 0,
			total_tokens: 0,
		},
	);
}

export type { SerializedAgentMessage };
