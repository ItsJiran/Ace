import type { EventData } from './events';

export type RAMEntryType = {
	memory_uid: string;
	process_uid: string;
	approx_bytes: number;
	type: string;
	child_count: number;
};

export type RAMStatsType = {
	memory_entries: number;
	change_listener_total: number;
	approx_total_bytes: number;
	approx_total_kb: number;
	approx_total_mb: number;
	largest_memories: RAMEntryType[];
};

export type EventEntryType = {
	slug: string;
	event_data: EventData<Record<string, unknown>, Record<string, unknown>>;
};

export type ProcessSystemValueType = Map<string, unknown> | Record<string, unknown> | undefined;