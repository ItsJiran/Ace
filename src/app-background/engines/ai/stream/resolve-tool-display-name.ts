export function resolveToolDisplayName(eventData: Record<string, unknown>, node?: string) {
	if (typeof eventData.name === 'string' && eventData.name.trim()) {
		return eventData.name;
	}

	if (typeof eventData.tool_name === 'string' && eventData.tool_name.trim()) {
		return eventData.tool_name;
	}

	if (typeof node === 'string' && node.trim()) {
		return node;
	}

	return 'tool';
}

export default resolveToolDisplayName;