// import { MessageCircleMore, Sparkles } from 'lucide-react';

// import { AceWindowHead } from '#/components/layout/ace-window-head';
// import type { AceWindowRenderProps } from '#/hooks/use-ace-window';

// import SystemAIChatMessages from './system-ai-chat-messages';

// type SystemAIChatConversationContainerProps = {
//     title?: string;
//     selectedSdk: string;
//     resolvedModel: string;
//     sessionUid?: string;
//     sessionStatus: string;
//     dragHandleProps: AceWindowRenderProps['dragHandleProps'];
//     isFocused: boolean;
//     isDragging: boolean;
//     onClose: () => void;
//     onMinimize: () => void;
// };

// export default function SystemAIChatConversationContainer({
//     title,
//     selectedSdk,
//     resolvedModel,
//     sessionUid,
//     sessionStatus,
//     dragHandleProps,
//     isFocused,
//     isDragging,
//     onClose,
//     onMinimize,
// }: SystemAIChatConversationContainerProps) {
//     return (
//         <section
//             className={[
//                 'system-shell-primary flex h-full w-full flex-col overflow-hidden rounded-[24px]',
//                 isDragging ? 'dragging focused' : '',
//                 !isDragging && isFocused ? 'focused' : '',
//             ].filter(Boolean).join(' ')}
//         >
//             <AceWindowHead
//                 title={title || 'ACE Chat'}
//                 icon={<Sparkles size={14} />}
//                 isFocused={isFocused}
//                 dragHandleProps={dragHandleProps}
//                 onMinimize={onMinimize}
//                 onClose={onClose}
//             />

//             <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
//                 <div className="min-w-0 flex-1">
//                     <div className="flex flex-wrap items-center gap-2">
//                         <span className="system-container-primary text-sm px-3 py-1 rounded-full">{selectedSdk}</span>
//                         <span className="system-container-primary text-sm px-3 py-1 rounded-full max-w-[220px] truncate">{resolvedModel || 'no model selected'}</span>
//                     </div>
//                 </div>

//                 <div className="flex shrink-0 flex-col items-end gap-1 text-right">
//                     <span className="system-chat-meta-note" title={sessionUid || ''}>
//                         session: {sessionUid || '-'}
//                     </span>
//                     <span className="system-chat-meta-note">state: {sessionStatus}</span>
//                 </div>
//             </div>

//             <div className="h-full overflow-auto px-5 pb-5 pt-4 [scrollbar-color:rgb(82_82_91_/_0.85)_transparent] [scrollbar-width:thin]">
//                 <SystemAIChatMessages sessionUid={sessionUid} className="system-chat-message-list" />
//             </div>
//         </section>
//     );
// }