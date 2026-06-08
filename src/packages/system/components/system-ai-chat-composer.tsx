import { ArrowUp, PauseCircle, Plus, RefreshCcw } from 'lucide-react';

import { useAceTheme } from '#/app-desktop/hooks/use-ace-theme';

type ModelOption = { id: string; name?: string };

type SystemAIChatComposerProps = {
	selectedProvider: string;
	setSelectedProvider: (provider: string) => void;
	resolvedModel: string;
	setSelectedModel: (model: string) => void;
	providerOptions: string[];
	modelOptions: ModelOption[];
	fetchModels: () => Promise<unknown>;
	handleCreateThread: () => Promise<void>;
	prompt: string;
	setPrompt: (value: string) => void;
	isStreaming: boolean;
	handleSubmit: (promptOverride?: string) => Promise<void>;
	handleInterrupt: () => Promise<void>;
};

export function SystemAIChatComposer({
	selectedProvider,
	setSelectedProvider,
	resolvedModel,
	setSelectedModel,
	providerOptions,
	modelOptions,
	fetchModels,
	handleCreateThread,
	prompt,
	setPrompt,
	isStreaming,
	handleSubmit,
	handleInterrupt,
}: SystemAIChatComposerProps) {
	const { targets } = useAceTheme();

	return (
		<section className={[targets.shell.first, 'flex shrink-0 flex-col gap-3 overflow-hidden rounded-2xl p-4'].join(' ')}>
			<div className="flex flex-wrap items-center gap-2">
				<select
					value={selectedProvider}
					onChange={(event) => setSelectedProvider(event.target.value)}
					className={[targets.input.first, 'min-w-[112px] rounded-xl px-3 py-2 text-sm'].join(' ')}
				>
					{providerOptions.length === 0 ? (
						<option value={selectedProvider}>{selectedProvider}</option>
					) : (
						providerOptions.map((name) => (
							<option key={name} value={name}>{name}</option>
						))
					)}
				</select>

				<select
					value={resolvedModel}
					onChange={(event) => setSelectedModel(event.target.value)}
					className={[targets.input.first, 'min-w-0 flex-1 rounded-xl px-3 py-2 text-sm'].join(' ')}
				>
					{modelOptions.length === 0 ? <option value={resolvedModel}>{resolvedModel}</option> : null}
					{modelOptions.map((model) => (
						<option key={model.id} value={model.id}>{model.name || model.id}</option>
					))}
				</select>

				<button type="button" onClick={() => void fetchModels()} className={[targets.btn.secondary, 'inline-flex items-center justify-center gap-2 rounded-2xl px-4 text-sm'].join(' ')}>
					<RefreshCcw size={15} />
					<span>Sync</span>
				</button>

				<button type="button" onClick={() => void handleCreateThread()} className={[targets.btn.secondary, 'inline-flex items-center justify-center gap-2 rounded-2xl px-4 text-sm'].join(' ')}>
					<Plus size={15} />
					<span>New</span>
				</button>
			</div>

			<div className="flex items-end gap-3">
				<textarea
					value={prompt}
					onChange={(event) => setPrompt(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter' && !event.shiftKey && !isStreaming) {
							event.preventDefault();
							void handleSubmit(event.currentTarget.value);
						}
					}}
					placeholder={isStreaming ? 'Streaming... press Stop to interrupt.' : 'Type a prompt... Enter to send, Shift+Enter for newline.'}
					rows={3}
					className={[targets.input.first, 'h-[50px] flex-1 resize-none px-4 py-3 text-sm leading-6 outline-none'].join(' ')}
					disabled={isStreaming}
				/>

				<button
					type="button"
					onClick={() => {
						if (isStreaming) {
							void handleInterrupt();
							return;
						}

						void handleSubmit();
					}}
					className={[targets.btn.secondary, 'inline-flex h-[45px] shrink-0 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-medium'].join(' ')}
				>
					{isStreaming ? <PauseCircle size={16} /> : <ArrowUp size={16} />}
					<span>{isStreaming ? 'Stop' : 'Send'}</span>
				</button>
			</div>
		</section>
	);
}