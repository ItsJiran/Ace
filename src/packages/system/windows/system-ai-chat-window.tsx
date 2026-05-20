import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useDragControls } from 'framer-motion';
import type { Transition } from 'framer-motion';
import { BaseMessage } from '@langchain/core/messages';
import { Sparkles } from 'lucide-react';

import { AceWindowHead } from '#/app-desktop/components/layout/ace-window-head';
import type { AceWindowRenderProps } from '#/app-desktop/hooks/use-ace-window';
import { useAceWindow } from '#/app-desktop/hooks/use-ace-window';
import { useAIGateway } from '#/app-desktop/hooks/use-ai-gateway';
import { useAIChatThread } from '#/app-desktop/hooks/use-ai-chat-thread';
import { defineWindow } from '#/lib/define-registry';
import { SystemAIChatComposer } from '#/packages/system/components/system-ai-chat-composer';
import { SystemAIChatHeader } from '#/packages/system/components/system-ai-chat-header';
import { SystemAIChatMessages } from '#/packages/system/components/system-ai-chat-messages';

const resizeHandleDefinitions = [
	{ direction: 'n', className: 'absolute left-3 right-3 top-0 h-2 -translate-y-1/2 cursor-n-resize' },
	{ direction: 'e', className: 'absolute bottom-3 right-0 top-3 w-2 translate-x-1/2 cursor-e-resize' },
	{ direction: 's', className: 'absolute bottom-0 left-3 right-3 h-2 translate-y-1/2 cursor-s-resize' },
	{ direction: 'w', className: 'absolute bottom-3 left-0 top-3 w-2 -translate-x-1/2 cursor-w-resize' },
	{ direction: 'ne', className: 'absolute right-0 top-0 h-4 w-4 translate-x-1/2 -translate-y-1/2 cursor-ne-resize' },
	{ direction: 'nw', className: 'absolute left-0 top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-nw-resize' },
	{ direction: 'se', className: 'absolute bottom-0 right-0 h-4 w-4 translate-x-1/2 translate-y-1/2 cursor-se-resize' },
	{ direction: 'sw', className: 'absolute bottom-0 left-0 h-4 w-4 -translate-x-1/2 translate-y-1/2 cursor-sw-resize' },
] as const;

function renderResizeHandles(
	getResizeHandleProps: AceWindowRenderProps['getResizeHandleProps'],
	isResizeAble: boolean,
) {
	if (!isResizeAble) {
		return null;
	}

	return resizeHandleDefinitions.map((handle) => (
		<div
			key={handle.direction}
			{...getResizeHandleProps(handle.direction)}
			className={handle.className}
			data-window-resize-handle={handle.direction}
		/>
	));
}

function SystemAIChatWindowBody({
	title,
	dragHandleProps,
	isFocused,
	isDragging,
	onClose,
	onMinimize,
}: {
	title?: string;
	dragHandleProps: AceWindowRenderProps['dragHandleProps'];
	isFocused: boolean;
	isDragging: boolean;
	onClose: () => void;
	onMinimize: () => void;
}) {
	const [prompt, setPrompt] = useState('');
	const bottomRef = useRef<HTMLDivElement | null>(null);
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
		current_thread_uid,
		is_streaming,
		running_tool_streams,
		pending_prompt,
		stream,
		createThread,
		setCurrentThread,
		sendPrompt,
		messages,
		list_threads,
	} = useAIChatThread();
	const renderedMessages = messages as BaseMessage[];

	const resolvedModel = selectedModel || ensureSelectedModel();
	const threadOptions = useMemo(() => Object.keys(list_threads), [list_threads]);
	const threadCount = useMemo(() => Object.keys(list_threads).length, [list_threads]);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
	}, [is_streaming, messages.length]);

	const handleSubmit = async (promptOverride?: string) => {
		const nextPrompt = (promptOverride ?? prompt).trim();
		if (!nextPrompt) {
			return;
		}

		if (promptOverride !== undefined && promptOverride !== prompt) {
			setPrompt(promptOverride);
		}
		setPrompt('');
		await sendPrompt(nextPrompt, selectedProvider, resolvedModel);
	};

	const handleCreateThread = async () => {
		await createThread({
			provider: selectedProvider,
			model: resolvedModel,
		});
	};

	return (
		<div className="system-ai-chatbar flex h-full flex-col gap-3 p-3 text-zinc-100">
			<section
				className={[
					'system-shell-primary flex h-full w-full flex-col overflow-hidden rounded-[24px]',
					isDragging ? 'dragging focused' : '',
					!isDragging && isFocused ? 'focused' : '',
				].filter(Boolean).join(' ')}
			>
				<AceWindowHead
					title={title || 'ACE Chat'}
					icon={<Sparkles size={14} />}
					isFocused={isFocused}
					dragHandleProps={dragHandleProps}
					onMinimize={onMinimize}
					onClose={onClose}
				/>

				<SystemAIChatHeader
					selectedProvider={selectedProvider}
					resolvedModel={resolvedModel}
					isStreaming={is_streaming}
					currentThreadUid={current_thread_uid}
					threadOptions={threadOptions}
					onSelectThread={(threadUid) => {
						void setCurrentThread(threadUid);
					}}
					onOpenThreadMonitor={() => {
						window.ACE.window.spawnWindow({
							package: 'itsjiran/ace-system',
							window: 'system-ai-thread-monitor-window',
							title: 'AI Thread Monitor',
							width: 1180,
							height: 760,
							x: 420,
							y: 120,
						});
					}}
					messageCount={renderedMessages.length}
					threadCount={threadCount}
				/>

				<SystemAIChatMessages
					messages={renderedMessages}
					isStreaming={is_streaming}
					pendingPrompt={pending_prompt}
					runningToolStreams={running_tool_streams}
					bottomRef={bottomRef}
				/>
			</section>

			<SystemAIChatComposer
				selectedProvider={selectedProvider}
				setSelectedProvider={setSelectedProvider}
				resolvedModel={resolvedModel}
				setSelectedModel={setSelectedModel}
				modelOptions={modelOptions}
				fetchModels={fetchModels}
				handleCreateThread={handleCreateThread}
				prompt={prompt}
				setPrompt={setPrompt}
				isStreaming={is_streaming}
				handleSubmit={handleSubmit}
				handleInterrupt={async () => {
					await stream.stop();
				}}
			/>
		</div>
	);
}

function SystemAIChatWindow({ windowUid }: { windowUid: string }) {
	const aceWindow = useAceWindow(windowUid);
	const dragControls = useDragControls();
	const resolvedConfig = aceWindow.windowConfig;

	if (!resolvedConfig) {
		return null;
	}

	const {
		beginDrag,
		animationState,
		close,
		minimize,
		focus,
		isFocused,
		isDragging,
		isResizing,
		isResizeAble,
		position,
		size,
		handleDragStart,
		handleDragEnd,
		handlePointerEnter,
		handlePointerLeave,
		ref,
		rootStyle,
		resolveWindowStateClass,
		windowConfig,
	} = aceWindow;

	const windowStateClass = resolveWindowStateClass();
	const isWindowStateActive = windowStateClass === 'active';
	const dragHandleProps: AceWindowRenderProps['dragHandleProps'] = {
		onPointerDown: (event) => {
			beginDrag(event, () => dragControls.start(event.nativeEvent, { snapToCursor: false }));
		},
	};

	const animateProps = {
		x: !isDragging && !isResizing && animationState?.values.x !== undefined ? animationState.values.x : position.x,
		y: !isDragging && !isResizing && animationState?.values.y !== undefined ? animationState.values.y : position.y,
		width: !isResizing && animationState?.values.width !== undefined ? animationState.values.width : size.width,
		height: !isResizing && animationState?.values.height !== undefined ? animationState.values.height : size.height,
		opacity: resolvedConfig.is_minimized ? 0 : (animationState?.values.opacity ?? resolvedConfig.opacity ?? 1),
		scale: isDragging ? 1.01 : (animationState?.values.scale ?? 1),
	};
	const transitionDuration = (animationState?.transitionMs ?? 140) / 1000;
	const transitionProps: Transition =
		animationState?.easing === 'spring_back'
			? {
					x: { type: 'spring', stiffness: 280, damping: 24, mass: 0.8 },
					y: { type: 'spring', stiffness: 280, damping: 24, mass: 0.8 },
					width: { type: 'spring', stiffness: 280, damping: 24, mass: 0.8 },
					height: { type: 'spring', stiffness: 280, damping: 24, mass: 0.8 },
					opacity: { duration: transitionDuration },
					scale: { type: 'spring', stiffness: 280, damping: 24, mass: 0.8 },
			  }
			: {
					x: { duration: transitionDuration, ease: 'easeInOut' },
					y: { duration: transitionDuration, ease: 'easeInOut' },
					width: { duration: transitionDuration, ease: 'easeInOut' },
					height: { duration: transitionDuration, ease: 'easeInOut' },
					opacity: { duration: transitionDuration, ease: 'easeInOut' },
					scale: { duration: transitionDuration, ease: 'easeInOut' },
			  };

	return (
		<motion.div
			ref={ref}
			drag
			dragListener={false}
			dragElastic={0}
			dragMomentum={false}
			dragControls={dragControls}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
			onPointerEnter={handlePointerEnter}
			onPointerLeave={handlePointerLeave}
			onMouseDown={focus}
			initial={{ ...animateProps, opacity: 0, scale: 0.98 }}
			animate={animateProps}
			transition={transitionProps}
			className="absolute left-0 top-0 select-none"
			style={{ ...rootStyle, touchAction: 'none' }}
			data-window-shell="system-ai-chat"
			data-window-uid={resolvedConfig.window_uid}
			data-window-active={isWindowStateActive ? 'true' : 'false'}
		>
			<div
				className={[
					'system-shell flex h-full w-full flex-col overflow-hidden rounded-[24px] pointer-events-auto',
					windowStateClass,
					isDragging ? 'dragging active' : '',
				].join(' ')}
			>
				<div className="flex-1 overflow-hidden">
					<SystemAIChatWindowBody
						title={windowConfig?.title}
						dragHandleProps={dragHandleProps}
						isFocused={isWindowStateActive || isFocused}
						isDragging={isDragging}
						onClose={close}
						onMinimize={minimize}
					/>
				</div>
			</div>
			{renderResizeHandles(aceWindow.getResizeHandleProps, isResizeAble)}
		</motion.div>
	);
}

export default defineWindow(SystemAIChatWindow, {
	name: 'system_ai_chat_window',
	slug: 'system-ai-chat-window',
	icon_slug: 'message-square-text',
	react_behavior: 'window_shell',
	default_config: {
		x: 430,
		y: 100,
		width: 780,
		height: 660,
		title: 'ACE Chat',
		window_style: 'standard',
		is_locked: false,
		always_on_top: false,
	},
});