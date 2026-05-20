export type ToolRendererKind = 'planning' | 'window' | 'filesystem' | 'duckduckgo' | 'generic';

export type ToolRendererProps = {
	toolName: string;
	content: unknown;
	artifact: unknown;
	record: Record<string, unknown>;
};

export function normalizeToolName(value: string) {
	return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

export function parseStructuredValue(value: unknown): unknown {
	if (typeof value !== 'string') {
		return value;
	}

	const trimmed = value.trim();
	if (!trimmed) {
		return value;
	}

	if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
		return value;
	}

	try {
		return JSON.parse(trimmed);
	} catch {
		return value;
	}
}

export function stringifyValue(value: unknown) {
	if (typeof value === 'string') {
		return value;
	}

	if (value === undefined) {
		return 'undefined';
	}

	if (value === null) {
		return 'null';
	}

	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

export function isPrimitive(value: unknown) {
	return value == null || ['string', 'number', 'boolean', 'bigint'].includes(typeof value);
}

export function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return null;
	}

	return value as Record<string, unknown>;
}

export function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function looksLikePlanningPayload(value: unknown): boolean {
	const record = asRecord(parseStructuredValue(value));
	if (!record) {
		return false;
	}

	return ['plan', 'steps', 'tasks', 'todo', 'todos', 'checklist', 'next_steps'].some((key) => key in record);
}

function looksLikeWindowPayload(value: unknown): boolean {
	const normalizedValue = parseStructuredValue(value);
	if (Array.isArray(normalizedValue)) {
		return normalizedValue.some((item) => looksLikeWindowPayload(item));
	}

	const record = asRecord(normalizedValue);
	if (!record) {
		return false;
	}

	return ['window_uid', 'windows', 'bounds', 'x', 'y', 'width', 'height', 'title'].some((key) => key in record);
}

function looksLikeFilesystemPayload(value: unknown): boolean {
	const normalizedValue = parseStructuredValue(value);
	if (Array.isArray(normalizedValue)) {
		if (
			normalizedValue.every((item) => {
				const record = asRecord(item);
				if (!record) {
					return false;
				}

				return ['path', 'is_dir', 'size', 'modified_at', 'line_number', 'line', 'match'].some(
					(key) => key in record,
				);
			})
		) {
			return true;
		}

		return normalizedValue.some((item) => looksLikeFilesystemPayload(item));
	}

	const record = asRecord(normalizedValue);
	if (!record) {
		return false;
	}

	return ['path', 'paths', 'content', 'entries', 'exists', 'directory', 'cwd', 'filename'].some((key) => key in record);
}

function looksLikeDuckDuckGoPayload(value: unknown): boolean {
	const normalizedValue = parseStructuredValue(value);
	if (!Array.isArray(normalizedValue) || normalizedValue.length === 0) {
		return false;
	}

	return normalizedValue.every((item) => {
		const record = asRecord(item);
		if (!record) {
			return false;
		}

		return ['title', 'link', 'snippet'].some((key) => key in record);
	});
}

export function resolveToolRendererKind({ toolName, content, artifact, record }: ToolRendererProps): ToolRendererKind {
	const normalizedToolName = normalizeToolName(toolName);

	if (/(plan|planning|todo|task)/.test(normalizedToolName)) {
		return 'planning';
	}

	if (/(window|ace_window)/.test(normalizedToolName)) {
		return 'window';
	}

	if (/(filesystem|file_system|\bfs\b|file|directory|path|\bls\b|\bglob\b|\bgrep\b|read_file|write_file|edit_file|mkdir|delete_file|move_file|copy_file)/.test(normalizedToolName)) {
		return 'filesystem';
	}

	if (/(duckduckgo|duck_duck_go|duckduckgo_search|duckduckgo_search|duckduckgo_search|search)/.test(normalizedToolName)) {
		if (looksLikeDuckDuckGoPayload(content) || looksLikeDuckDuckGoPayload(artifact) || looksLikeDuckDuckGoPayload(record)) {
			return 'duckduckgo';
		}
	}

	if (looksLikePlanningPayload(artifact) || looksLikePlanningPayload(content)) {
		return 'planning';
	}

	if (looksLikeWindowPayload(artifact) || looksLikeWindowPayload(content) || looksLikeWindowPayload(record)) {
		return 'window';
	}

	if (looksLikeFilesystemPayload(artifact) || looksLikeFilesystemPayload(content) || looksLikeFilesystemPayload(record)) {
		return 'filesystem';
	}

	if (looksLikeDuckDuckGoPayload(artifact) || looksLikeDuckDuckGoPayload(content) || looksLikeDuckDuckGoPayload(record)) {
		return 'duckduckgo';
	}

	return 'generic';
}