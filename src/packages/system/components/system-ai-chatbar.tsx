// import { useMemo, useState } from "react";

// import type { AceWindowRenderProps } from "#/app-desktop/hooks/use-ace-window";

// import { useAIGateway } from "#/app-desktop/hooks/use-ai-gateway";
// import { useAIChatSession } from "#/app-desktop/hooks/use-ai-chat-session";
// import { AISessionStatus } from "#/shared/schemas/ai";

// import SystemAIChatConversationContainer from "./system-ai-chat-conversation-container";
// import SystemAIChatPromptContainer from "./system-ai-chat-prompt-container";

// type SystemAIChatbarProps = {
//   title?: string;
//   dragHandleProps: AceWindowRenderProps["dragHandleProps"];
//   isFocused: boolean;
//   isDragging: boolean;
//   onClose: () => void;
//   onMinimize: () => void;
// };

// export default function SystemAIChatbar({
//   title,
//   dragHandleProps,
//   isFocused,
//   isDragging,
//   onClose,
//   onMinimize,
// }: SystemAIChatbarProps) {
//   const [prompt, setPrompt] = useState("");
//   const {
//     selectedSdk,
//     setSelectedSdk,
//     selectedModel,
//     setSelectedModel,
//     modelOptions,
//     ensureSelectedModel,
//   } = useAIGateway();
//   const { session, sessionUid, sendPrompt, interruptSession } =
//     useAIChatSession();

//   const isStreaming = session?.status === AISessionStatus.STREAMING;
//   const resolvedModel = useMemo(
//     () => selectedModel || ensureSelectedModel(),
//     [ensureSelectedModel, selectedModel],
//   );

//   const submitPrompt = () => {
//     const nextPrompt = prompt.trim();
//     if (!nextPrompt || isStreaming) {
//       return;
//     }

//     sendPrompt(nextPrompt, selectedSdk, ensureSelectedModel());
//     setPrompt("");
//   };

//   return (
//     <div className="system-ai-chatbar flex h-full flex-col gap-3">
//       <SystemAIChatConversationContainer
//         title={title}
//         selectedSdk={selectedSdk}
//         resolvedModel={resolvedModel}
//         sessionUid={sessionUid ?? undefined}
//         sessionStatus={session?.status ?? "idle"}
//         dragHandleProps={dragHandleProps}
//         isFocused={isFocused}
//         isDragging={isDragging}
//         onClose={onClose}
//         onMinimize={onMinimize}
//       />

//       <SystemAIChatPromptContainer
//         selectedSdk={selectedSdk}
//         resolvedModel={resolvedModel}
//         modelOptions={modelOptions}
//         isStreaming={isStreaming}
//         isFocused={isFocused}
//         isDragging={isDragging}
//         prompt={prompt}
//         onPromptChange={setPrompt}
//         onSelectedSdkChange={(sdk) => setSelectedSdk(sdk as typeof selectedSdk)}
//         onSelectedModelChange={setSelectedModel}
//         onSubmitPrompt={submitPrompt}
//         onInterruptSession={interruptSession}
//       />
//     </div>
//   );
// }
