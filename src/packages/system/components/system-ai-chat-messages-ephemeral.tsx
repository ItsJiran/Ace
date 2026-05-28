import type {
	AgentClientThreadEphemeralItem,
	AgentClientThreadEphemeralLifecycle,
	AgentClientThreadEphemeralMessage,
	AgentClientThreadEphemeralStep,
	AgentClientThreadEphemeralTool,
	AgentClientThreadRuntimeState,
} from '#/shared/schemas/ai';
import {
	resolveLifecycleLabel,
	resolveMessageLiveText,
	resolveStepNode,
	resolveStepTitle,
	resolveToolDisplayName,
	resolveToolInput,
	resolveToolInputLabel,
} from './system-ai-chat-messages.utils';

type SystemAIChatMessagesEphemeralProps = {
	ephemeralStreams: AgentClientThreadEphemeralItem[];
	currentThreadRuntime?: AgentClientThreadRuntimeState;
	currentThreadUid: string | null;
	onRetryFailedRun?: () => void | Promise<void>;
	targets: Record<string, Record<string, string>>;
};

function renderEphemeralStream(
	item: AgentClientThreadEphemeralItem,
	targets: Record<string, Record<string, string>>,
) {
	if (item.type === 'lifecycle') {
		return (
			<div key={`${item.type}:${item.uid}:${item.updated_at}`} className={[targets.container.first, 'rounded-2xl px-3 py-2 text-xs text-zinc-400'].join(' ')}>
				<span className="font-medium text-zinc-300">{resolveLifecycleLabel(item as AgentClientThreadEphemeralLifecycle)}</span>
			</div>
		);
	}

	if (item.type === 'messages') {
		return (
			<div key={`${item.type}:${item.uid}:${item.updated_at}`} className={[targets.container.first, 'rounded-2xl px-3 py-3'].join(' ')}>
				<div className="text-xs text-zinc-400">{resolveMessageLiveText(item as AgentClientThreadEphemeralMessage)}</div>
			</div>
		);
	}

	if (item.type === 'step') {
		const stepItem = item as AgentClientThreadEphemeralStep;
		return (
			<div key={`${item.type}:${item.uid}:${item.updated_at}`} className={[targets.container.first, 'rounded-2xl animate-pulse px-3 py-3'].join(' ')}>
				<div className="flex items-center gap-2 text-xs">
					<span className={[targets.container.second, 'inline-flex h-2.5 w-2.5 rounded-full'].join(' ')} />
					<span>{resolveStepTitle(stepItem)}</span>
				</div>
				<div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">{resolveStepNode(stepItem)}</div>
			</div>
		);
	}

	const toolItem = item as AgentClientThreadEphemeralTool;
	return (
		<div key={`${item.type}:${item.uid}:${item.updated_at}`} className={[targets.container.first, 'rounded-2xl animate-pulse px-3 py-3'].join(' ')}>
			<div className="flex items-center gap-2 text-xs">
				<span className={[targets.container.second, 'inline-flex h-2.5 w-2.5 rounded-full'].join(' ')} />
				<span>Sedang menjalankan {resolveToolDisplayName(toolItem)}</span>
			</div>
			{resolveToolInputLabel(resolveToolInput(toolItem)) ? (
				<div className="mt-2 whitespace-pre-wrap break-words text-xs text-zinc-400">
					{resolveToolInputLabel(resolveToolInput(toolItem))}
				</div>
			) : null}
		</div>
	);
}

export function SystemAIChatMessagesEphemeral({
	ephemeralStreams,
	currentThreadRuntime,
	currentThreadUid,
	onRetryFailedRun,
	targets,
}: SystemAIChatMessagesEphemeralProps) {
	const hasLifecycle = ephemeralStreams.some((item) => item.type === 'lifecycle');
	const hasMessage = ephemeralStreams.some((item) => item.type === 'messages');
	const hasStep = ephemeralStreams.some((item) => item.type === 'step');
	const hasTool = ephemeralStreams.some((item) => item.type === 'tool');
	const failedLifecycle = [...ephemeralStreams]
		.reverse()
		.find(
			(item) =>
				item.type === 'lifecycle' &&
				(((item.content as Record<string, unknown>).event as string | undefined) === 'failed' ||
					item.event === 'failed'),
		) as AgentClientThreadEphemeralLifecycle | undefined;
	const failedErrorText =
		typeof failedLifecycle?.content.error === 'string'
			? failedLifecycle.content.error
			: 'Thread run failed before producing a full response.';
	const streamPhase = currentThreadRuntime?.stream_phase;
	const activeNode = currentThreadRuntime?.active_node;

	if (ephemeralStreams.length === 0) {
		return null;
	}

	return (
		<div className="flex justify-start">
			<div className="flex min-w-0 max-w-[88%] flex-col items-start gap-2">
				<div className="ace-chat-turn-label">Assistant</div>
				<div className={[targets.container.first, 'w-full rounded-[14px_14px_14px_4px] px-4 py-3 text-sm leading-6 text-zinc-500 shadow-sm'].join(' ')}>
					<div className="flex flex-col gap-3">
						{failedLifecycle ? (
							<div className={[targets.container.second, 'rounded-2xl border border-red-500/30 px-3 py-3 text-xs text-red-200'].join(' ')}>
								<div className="font-medium text-red-100">Run failed</div>
								<div className="mt-1 whitespace-pre-wrap break-words">{failedErrorText}</div>
								{onRetryFailedRun ? (
									<div className="mt-3">
										<button
											type="button"
											onClick={() => {
												void onRetryFailedRun();
											}}
											className={[targets.btn.secondary, 'rounded-xl px-3 py-1.5 text-[11px]'].join(' ')}
										>
											Retry run
										</button>
									</div>
								) : null}
							</div>
						) : null}

						<div className="flex flex-wrap items-center gap-2 text-zinc-500">
							{streamPhase === 'started' ? <span className="ace-chat-status-pill text-xsm is-streaming">start</span> : null}
							{streamPhase === 'streaming' ? <span className="ace-chat-status-pill text-xsm is-streaming">stream</span> : null}
							{streamPhase === 'completed' ? <span className="ace-chat-status-pill text-xsm is-streaming">end</span> : null}
							{streamPhase === 'failed' ? <span className="ace-chat-status-pill text-xsm is-streaming">failed</span> : null}
							{typeof activeNode === 'string' && activeNode.trim() ? (
								<span className="ace-chat-status-pill text-xsm is-streaming">node: {activeNode}</span>
							) : null}
							{typeof currentThreadUid === 'string' && currentThreadUid.trim() ? (
								<span className="ace-chat-status-pill text-xsm is-streaming">thread: {currentThreadUid.slice(0, 8)}</span>
							) : null}
							{hasLifecycle ? <span className="ace-chat-status-pill text-xsm is-streaming">run active</span> : null}
							{hasMessage ? <span className="ace-chat-status-pill text-xsm is-streaming">assistant streaming</span> : null}
							{hasStep ? <span className="ace-chat-status-pill text-xsm is-streaming">agent running</span> : null}
							{hasTool ? <span className="ace-chat-status-pill text-xsm is-streaming">running tools</span> : null}
							{/* {currentThreadUid ? (
								<button
									type="button"
									onClick={() => openThreadDetailWindow(currentThreadUid)}
									className={[targets.btn.secondary, 'inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-[11px]'].join(' ')}
								>
									<ExternalLink size={13} />
									<span>Open thread detail</span>
								</button>
							) : null} */}
						</div>

						<div className="flex flex-col gap-2">{ephemeralStreams.map((item) => renderEphemeralStream(item, targets))}</div>
					</div>
				</div>
			</div>
		</div>
	);
}
