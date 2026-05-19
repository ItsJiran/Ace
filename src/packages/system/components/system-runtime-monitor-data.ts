import { useEffect, useMemo, useState } from 'react';

import { useAceMemory } from '#/app-desktop/hooks/use-ace-memory';
import { EventBus } from '#/shared/engines/event-engine';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import type { ProcessRecord } from '#/shared/schemas/process';
import type {
	EventEntryType,
	ProcessSystemValueType,
	RAMStatsType,
} from '#/shared/schemas/runtime-monitor';

export function formatBytes(bytes: number) {
	if (bytes >= 1024 * 1024) {
		return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	}

	if (bytes >= 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}

	return `${bytes} B`;
}

export function resolveProcessCount(
	processSystem: ProcessSystemValueType,
	processRecords: ProcessRecord[],
) {
	if (processSystem instanceof Map) {
		return processSystem.size;
	}

	if (processSystem && typeof processSystem === 'object') {
		return Object.keys(processSystem).length;
	}

	return processRecords.length;
}

export function useRuntimeMonitorSnapshots() {
	const processSystem = useAceMemory<ProcessSystemValueType>('system:process_system');
	const eventStream = useAceMemory<EventEntryType[]>(EventBus.eventStreamMemoryUid) ?? [];
	const [ramStats, setRamStats] = useState<RAMStatsType>(() => KernelEngine.getRAMStats() as RAMStatsType);
	const [processRecords, setProcessRecords] = useState<ProcessRecord[]>(() => KernelEngine.getAllProcesses());

	useEffect(() => {
		const syncSnapshot = () => {
			setRamStats(KernelEngine.getRAMStats() as RAMStatsType);
			setProcessRecords(KernelEngine.getAllProcesses());
		};

		syncSnapshot();
		const intervalId = window.setInterval(syncSnapshot, 700);
		return () => window.clearInterval(intervalId);
	}, []);

	const topRamEntries = useMemo(() => ramStats.largest_memories.slice(0, 16), [ramStats]);
	const recentEvents = useMemo(() => eventStream.slice(-20).reverse(), [eventStream]);
	const recentProcesses = useMemo(
		() => [...processRecords].sort((left, right) => right.updated_at - left.updated_at).slice(0, 20),
		[processRecords],
	);
	const processCount = resolveProcessCount(processSystem, processRecords);

	return {
		processSystem,
		eventStream,
		ramStats,
		processRecords,
		topRamEntries,
		recentEvents,
		recentProcesses,
		processCount,
	};
}