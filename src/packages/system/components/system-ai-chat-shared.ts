export function resolveMessageText(content: unknown): string {
	if (typeof content === 'string') {
		return content;
	}

	if (content && typeof content === 'object') {
		const record = content as Record<string, unknown>;
		if (typeof record.text === 'string') {
			return record.text;
		}

		if (typeof record.content === 'string') {
			return record.content;
		}

		if (Array.isArray(record.content)) {
			return resolveMessageText(record.content);
		}
	}

	if (Array.isArray(content)) {
		return content
			.map((item) => {
				if (typeof item === 'string') {
					return item;
				}

				if (!item || typeof item !== 'object') {
					return '';
				}

				const block = item as Record<string, unknown>;
				return typeof block.text === 'string' ? block.text : '';
			})
			.join('')
			.trim();
	}

	return '';
}