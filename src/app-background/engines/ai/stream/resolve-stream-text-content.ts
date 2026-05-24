export function resolveStreamTextContent(content: unknown): string {
	if (typeof content === 'string') {
		return content;
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

				const record = item as Record<string, unknown>;
				if (typeof record.text === 'string') {
					return record.text;
				}

				if (typeof record.content === 'string') {
					return record.content;
				}

				return '';
			})
			.join('');
	}

	if (content && typeof content === 'object') {
		const record = content as Record<string, unknown>;
		if (typeof record.content === 'string') {
			return record.content;
		}

		if (Array.isArray(record.content)) {
			return resolveStreamTextContent(record.content);
		}
	}

	return '';
}

export default resolveStreamTextContent;