// import type { KeyboardEvent } from 'react';
// import { ArrowUp, PauseCircle } from 'lucide-react';

// type ModelOption = {
//     id: string;
//     name?: string;
// };

// type SystemAIChatPromptContainerProps = {
//     selectedSdk: string;
//     resolvedModel: string;
//     modelOptions: ModelOption[];
//     isStreaming: boolean;
//     isFocused: boolean;
//     isDragging: boolean;
//     prompt: string;
//     onPromptChange: (value: string) => void;
//     onSelectedSdkChange: (sdk: string) => void;
//     onSelectedModelChange: (model: string) => void;
//     onSubmitPrompt: () => void;
//     onInterruptSession: () => void;
// };

// export default function SystemAIChatPromptContainer({
//     selectedSdk,
//     resolvedModel,
//     modelOptions,
//     isStreaming,
//     isFocused,
//     isDragging,
//     prompt,
//     onPromptChange,
//     onSelectedSdkChange,
//     onSelectedModelChange,
//     onSubmitPrompt,
//     onInterruptSession,
// }: SystemAIChatPromptContainerProps) {
//     const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
//         if (event.key === 'Enter' && !event.shiftKey && !isStreaming) {
//             event.preventDefault();
//             onSubmitPrompt();
//         }
//     };

//     return (
//         <section
//             className={[
//                 'system-shell-primary flex shrink-0 flex-col gap-3 rounded-2xl p-4 overflow-hidden',
//                 isDragging ? 'dragging focused' : '',
//                 !isDragging && isFocused ? 'focused' : '',
//             ].filter(Boolean).join(' ')}
//         >
//             <div className="flex items-center gap-2">
//                 <select
//                     value={selectedSdk}
//                     onChange={(event) => onSelectedSdkChange(event.target.value)}
//                     className="min-w-[112px] rounded-xl px-3 py-2 text-sm system-input-primary"
//                 >
//                     <option value="openai">openai</option>
//                     <option value="google">google</option>
//                     <option value="anthropic">anthropic</option>
//                 </select>

//                 <select
//                     value={resolvedModel}
//                     onChange={(event) => onSelectedModelChange(event.target.value)}
//                     className="min-w-0 flex-1 rounded-xl px-3 py-2 text-sm system-input-primary"
//                 >
//                     {modelOptions.length === 0 ? <option value={resolvedModel}>{resolvedModel}</option> : null}
//                     {modelOptions.map((model) => (
//                         <option key={model.id} value={model.id}>{model.name || model.id}</option>
//                     ))}
//                 </select>

//                 <span className={['system-chat-status-pill', isStreaming ? 'is-streaming' : ''].filter(Boolean).join(' ')}>
//                     {isStreaming ? 'streaming' : 'idle'}
//                 </span>
//             </div>

//             <div className="flex items-end gap-3">
//                 <textarea
//                     value={prompt}
//                     onChange={(event) => onPromptChange(event.target.value)}
//                     onKeyDown={handleKeyDown}
//                     placeholder={isStreaming ? 'Streaming... press Stop to interrupt.' : 'Type a prompt... Enter to send, Shift+Enter for newline.'}
//                     rows={3}
//                     className="flex-1 h-[45px] resize-none system-input-primary px-4 py-3 text-sm leading-6 outline-none"
//                     disabled={isStreaming}
//                 />

//                 <button
//                     type="button"
//                     onClick={() => {
//                         if (isStreaming) {
//                             onInterruptSession();
//                             return;
//                         }

//                         onSubmitPrompt();
//                     }}
//                     className={[
//                         'inline-flex h-[45px] shrink-0 items-center justify-center gap-2 rounded-2xl px-5 text-sm font-medium system-btn-secondary',
//                         isStreaming
//                             ? ''
//                             : '',
//                     ].join(' ')}
//                 >
//                     {isStreaming ? <PauseCircle size={16} /> : <ArrowUp size={16} />}
//                     <span>{isStreaming ? 'Stop' : 'Send'}</span>
//                 </button>
//             </div>
//         </section>
//     );
// }