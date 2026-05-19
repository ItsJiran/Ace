import { useMemo, useState } from 'react';
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';

import { RenderCounterBadge } from '#/app-desktop/components/dev/render-counter-badge';
import { useAIGateway } from '#/app-desktop/hooks/use-ai-gateway';
import { useAIChatThread } from '#/app-desktop/hooks/use-ai-chat-thread';
import { defineComponent } from '#/lib/define-registry';

function resolveMessageText(content: unknown): string {
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

		if (typeof record.kwargs === 'object' && record.kwargs) {
			return resolveMessageText((record.kwargs as Record<string, unknown>).content);
		}

		if (typeof record.lc_kwargs === 'object' && record.lc_kwargs) {
			return resolveMessageText((record.lc_kwargs as Record<string, unknown>).content);
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

function DevAIChatThread() {
	const [prompt, setPrompt] = useState('');
	const {
		selectedProvider,
		setSelectedProvider,
		selectedModel,
		setSelectedModel,
		modelOptions,
		ensureSelectedModel,
		fetchModels,
	} = useAIGateway();
	const {
		list_threads,
		current_thread_uid,
		current_thread,
		stream,
		refreshThreads,
		setCurrentThread,
		createThread,
		sendPrompt,
	} = useAIChatThread();

	const threadIds = useMemo(() => Object.keys(list_threads), [list_threads]);
	const resolvedModel = selectedModel || ensureSelectedModel();

	const handleCreateThread = async () => {
		await createThread({
			provider: selectedProvider,
			model: resolvedModel,
		});
	};

	const handleSubmit = async () => {
		const nextPrompt = prompt.trim();
		if (!nextPrompt) {
			return;
		}

		await sendPrompt(nextPrompt, selectedProvider, resolvedModel);
		setPrompt('');
	};

	return (
		<div className="flex h-full min-h-0 flex-col gap-4 p-4 text-zinc-100">
			<RenderCounterBadge componentName="dev-ai-chat-thread" />

			<div className="grid grid-cols-[220px_minmax(0,1fr)] gap-4 min-h-0 flex-1">
				<section className="system-shell-primary rounded-2xl p-3 flex min-h-0 flex-col gap-3">
					<div className="flex items-center justify-between gap-2">
						<div>
							<div className="text-sm font-semibold">Threads</div>
							<div className="text-xs text-zinc-400">Source: background AI engine</div>
						</div>
						<button
							type="button"
							onClick={() => void refreshThreads()}
							className="system-btn-secondary px-3 py-2 text-xs"
						>
							Refresh
						</button>
					</div>

					<button
						type="button"
						onClick={() => void handleCreateThread()}
						className="system-btn-primary px-3 py-2 text-sm"
					>
						Create Thread
					</button>

					<div className="flex-1 overflow-auto space-y-2 pr-1">
						{threadIds.length === 0 ? (
							<div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-400">
								No thread yet.
							</div>
						) : null}

						{threadIds.map((threadUid) => (
							<button
								key={threadUid}
								type="button"
								onClick={() => void setCurrentThread(threadUid)}
								className={[
									'w-full rounded-xl border px-3 py-2 text-left text-xs transition-colors',
									current_thread_uid === threadUid
										? 'border-sky-400/60 bg-sky-500/10 text-sky-100'
										: 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10',
								].join(' ')}
							>
								<div className="truncate font-medium">{threadUid}</div>
								<div className="truncate text-[11px] text-zinc-400">
									{list_threads[threadUid]}
								</div>
							</button>
						))}
					</div>
				</section>

				<section className="system-shell-primary rounded-2xl p-4 flex min-h-0 flex-col gap-4 overflow-hidden">
					<div className="grid grid-cols-2 gap-3">
						<label className="flex flex-col gap-2 text-xs text-zinc-400">
							<span>Provider</span>
							<select
								value={selectedProvider}
								onChange={(event) => setSelectedProvider(event.target.value as typeof selectedProvider)}
								className="system-input-primary rounded-xl px-3 py-2 text-sm text-zinc-100"
							>
								<option value="openai">openai</option>
								<option value="google">google</option>
								<option value="anthropic">anthropic</option>
							</select>
						</label>

						<label className="flex flex-col gap-2 text-xs text-zinc-400">
							<span>Model</span>
							<select
								value={resolvedModel}
								onChange={(event) => setSelectedModel(event.target.value)}
								className="system-input-primary rounded-xl px-3 py-2 text-sm text-zinc-100"
							>
								{modelOptions.length === 0 ? (
									<option value={resolvedModel}>{resolvedModel}</option>
								) : null}
								{modelOptions.map((model: { id: string; name?: string }) => (
									<option key={model.id} value={model.id}>
										{model.name || model.id}
									</option>
								))}
							</select>
						</label>
					</div>

					<div className="flex items-center gap-2 text-xs text-zinc-400">
						<button
							type="button"
							onClick={() => void fetchModels()}
							className="system-btn-secondary px-3 py-2"
						>
							Sync Models
						</button>
						<span>current_thread_uid: {current_thread_uid ?? '-'}</span>
						<span>messages: {stream.messages.length}</span>
					</div>

					<div className="rounded-2xl system-container-quaternary px-3 py-2 text-xs">
						<div>provider: {current_thread?.provider ?? '-'}</div>
						<div>model: {current_thread?.model ?? '-'}</div>
						<div>checkpoint: {current_thread?.checkpoint_id ?? '-'}</div>
					</div>

					<div className="flex-1 min-h-0 overflow-auto rounded-2xl system-container-quaternary p-3 space-y-3">
						{stream.messages.length === 0 ? (
							<div className="text-sm">No messages yet.</div>
						) : null}

						{stream.messages.map((message, index) => {
							if (HumanMessage.isInstance(message)) {
								return (
									<div key={message.id ?? index} className="flex justify-end">
										<div className="max-w-[78%] rounded-2xl rounded-br-md bg-sky-500/15 border border-sky-400/30 px-4 py-3 text-sm text-sky-50">
											<div className="mb-1 text-[11px] uppercase tracking-wide text-sky-200/80">Human</div>
											<div className="whitespace-pre-wrap">{message.text || resolveMessageText(message.content)}</div>
										</div>
									</div>
								);
							}

							if (AIMessage.isInstance(message)) {
								return (
									<div key={message.id ?? index} className="flex justify-start">
										<div className="max-w-[78%] rounded-2xl rounded-bl-md bg-white/6 border border-white/10 px-4 py-3 text-sm text-zinc-100">
											<div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">AI</div>
											<div className="whitespace-pre-wrap">{message.text || resolveMessageText(message.content)}</div>
										</div>
									</div>
								);
							}

							if (ToolMessage.isInstance(message)) {
								return (
									<div key={message.id ?? index} className="flex justify-start">
										<div className="max-w-[82%] rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-50">
											<div className="mb-1 text-[11px] uppercase tracking-wide text-amber-200/80">Tool</div>
											<div className="whitespace-pre-wrap">{typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2)}</div>
										</div>
									</div>
								);
							}

							return (
								<div key={message.id ?? index} className="rounded-xl bg-white/5 px-3 py-2">
									<div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">{message.getType()}</div>
									<div className="whitespace-pre-wrap text-sm text-zinc-100">{resolveMessageText(message.content) || JSON.stringify(message.content)}</div>
								</div>
							);
						})}
					</div>

					{stream.isLoading ? (
						<div className="text-xs text-zinc-500">Agent is processing...</div>
					) : null}

					<div className="flex gap-3">
						<textarea
							value={prompt}
							onChange={(event) => setPrompt(event.target.value)}
							placeholder="Type a prompt to create/sync a background thread"
							rows={4}
							className="system-input-primary min-h-[96px] flex-1 resize-none rounded-2xl px-4 py-3 text-sm text-zinc-100"
						/>
						<button
							type="button"
							onClick={() => void handleSubmit()}
							className="system-btn-primary min-w-[120px] rounded-2xl px-4 py-3 text-sm"
						>
							Send Prompt
						</button>
					</div>
				</section>
			</div>
		</div>
	);
}

export default defineComponent(DevAIChatThread, {
	name: 'dev_ai_chat_thread',
	slug: 'dev-ai-chat-thread',
	react_behavior: 'dev_ai_chat_thread',
});