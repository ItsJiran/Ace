import { Engine } from '#/shared/engines/engine';
import { ConfigEngine } from '#/shared/engines/config-engine';
import { DefaultConfigAI } from '#/shared/constants/config';
import { KernelEngine } from '#/shared/engines/kernel-engine';
import type {
	AgentConfigurable,
	AgentThread,
	AgentThreadSnapshot,
	AgentThreadSyncPayload,
	AIProviderType,
} from '#/shared/schemas/ai';

type BackgroundThreadListEntryType = {
	thread_uid: string;
	memory_uid: string;
	thread: AgentThread;
};

type BackgroundThreadListPayloadType = {
	index: Record<string, string>;
	threads: BackgroundThreadListEntryType[];
};

class DesktopAIEngineSingleton extends Engine {
	public readonly memory_uid = DefaultConfigAI.memory_uid;
	public readonly thread_uids_memory_uid = 'system:ai_engine:thread:uids';
	public readonly current_thread_uid_memory_uid = 'system:ai_engine:thread:active_uid';
	public readonly thread_memory_uid = (thread_uid: string) => `system:ai_engine:thread:${thread_uid}`;

	async boot() {
		await this.syncAIMemory();
	}

	async setupEventRoutes() {}
	async setupKernelSpace() {
		KernelEngine.registerSystemMemory(this.thread_uids_memory_uid, {} as Record<string, string>);
		KernelEngine.registerSystemMemory(this.current_thread_uid_memory_uid, null as string | null);
	}
	async setupKernelTerminationHook() {}

	async getBackgroundStatus() {
		return (
			(await window.electronAPI?.backgroundStatus()) ?? {
				active: false,
				runtime_mode: 'desktop',
				pid: null,
			}
		);
	}

	async syncConfigFromBackground() {
		await ConfigEngine.syncConfigFileToRam('ai');
		return ConfigEngine.getConfigItems<Record<string, unknown>>('ai');
	}

	readThreadFromMemory(threadUid: string) {
		return KernelEngine.readMemory(this.thread_memory_uid(threadUid)) as AgentThread | undefined;
	}

	readThreadIndexFromMemory() {
		return (
			(KernelEngine.readMemory(this.thread_uids_memory_uid) as Record<string, string> | undefined) ?? {}
		);
	}

	readCurrentThreadUidFromMemory() {
		return (KernelEngine.readMemory(this.current_thread_uid_memory_uid) as string | null | undefined) ?? null;
	}

	setCurrentThread(threadUid: string | null) {
		KernelEngine.writeMemory(this.current_thread_uid_memory_uid, threadUid);
		return threadUid;
	}

	syncThreadMemory(thread: AgentThread) {
		const memoryUid = this.thread_memory_uid(thread.thread_uid);
		const existingThread = KernelEngine.readMemory(memoryUid);

		if (existingThread === undefined) {
			KernelEngine.registerSystemMemory(memoryUid, thread);
		} else {
			KernelEngine.writeMemory(memoryUid, thread);
		}

		const currentIndex = this.readThreadIndexFromMemory();
		if (currentIndex[thread.thread_uid] !== memoryUid) {
			KernelEngine.writeMemory(this.thread_uids_memory_uid, {
				...currentIndex,
				[thread.thread_uid]: memoryUid,
			});
		}

		return memoryUid;
	}

	syncThreadIndex(index: Record<string, string>) {
		KernelEngine.writeMemory(this.thread_uids_memory_uid, index);
		return index;
	}

	async syncCurrentThreadFromBackground(threadUid: string) {
		const thread = ((await this.invoke('ai.readThread', {
			thread_uid: threadUid,
		})) ?? null) as AgentThread | null;

		if (!thread) {
			return null;
		}

		this.syncThreadMemory(thread);
		return thread;
	}

	async syncAIMemory() {
		await this.syncConfigFromBackground();

		const payload = ((await this.invoke('ai.listThreads')) ?? {
			index: {},
			threads: [],
		}) as BackgroundThreadListPayloadType;

		this.syncThreadIndex(payload.index ?? {});
		for (const entry of payload.threads ?? []) {
			this.syncThreadMemory(entry.thread);
		}

		const nextActiveThreadUid = this.readCurrentThreadUidFromMemory();
		if (nextActiveThreadUid && payload.index?.[nextActiveThreadUid]) {
			return payload;
		}

		const fallbackThreadUid = payload.threads?.[0]?.thread_uid ?? null;
		this.setCurrentThread(fallbackThreadUid);
		return payload;
	}

	async fetchModels(provider: AIProviderType | string) {
		const models = (await window.electronAPI?.backgroundSyncModels(String(provider))) ?? [];
		await this.syncConfigFromBackground();
		return models;
	}

	async listThreads() {
		const payload = await this.syncAIMemory();
		return payload.threads ?? [];
	}

	async createThread(initialState: Partial<AgentThreadSnapshot> = {}) {
		const thread = (
			(await window.electronAPI?.backgroundCreateThread(
				initialState as Record<string, unknown>,
			)) ?? {
				thread_id: initialState.thread_uid ?? crypto.randomUUID(),
			}
		) as AgentConfigurable;

		this.setCurrentThread(thread.thread_id);
		await this.syncCurrentThreadFromBackground(thread.thread_id);
		return thread;
	}

	async readThread(threadUid: string) {
		return await this.syncCurrentThreadFromBackground(threadUid);
	}

	async syncThread(threadUid: string, payload: AgentThreadSyncPayload = {}) {
		const memoryUid = (
			(await window.electronAPI?.backgroundSyncThread(
				threadUid,
				payload as Record<string, unknown>,
			)) ?? ''
		);

		await this.syncCurrentThreadFromBackground(threadUid);
		return memoryUid;
	}

	async streamThreadPrompt(
		threadUid: string,
		prompt: string,
		overrides: Partial<AgentConfigurable> = {},
	) {
		const thread = ((await this.invoke('ai.streamThreadPrompt', {
			thread_uid: threadUid,
			prompt,
			overrides,
		})) ?? null) as AgentThread | null;

		if (thread) {
			this.syncThreadMemory(thread);
			this.setCurrentThread(thread.thread_uid);
			return thread;
		}

		return await this.syncCurrentThreadFromBackground(threadUid);
	}

	async deleteThread(threadUid: string) {
		const deleted = (await window.electronAPI?.backgroundDeleteThread(threadUid)) ?? false;
		if (!deleted) {
			return false;
		}

		KernelEngine.deleteMemory(this.thread_memory_uid(threadUid));
		const nextIndex = { ...this.readThreadIndexFromMemory() };
		delete nextIndex[threadUid];
		this.syncThreadIndex(nextIndex);

		if (this.readCurrentThreadUidFromMemory() === threadUid) {
			this.setCurrentThread(Object.keys(nextIndex)[0] ?? null);
		}

		return true;
	}

	async invoke(method: string, payload: Record<string, unknown> = {}) {
		return await window.electronAPI?.backgroundInvoke(method, payload);
	}
}

export const AIEngine = new DesktopAIEngineSingleton();