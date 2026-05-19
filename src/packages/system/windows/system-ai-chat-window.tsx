// import type { AceWindowRenderProps } from '#/app-desktop/hooks/use-ace-window';
// import type { WindowConfig } from '#/shared/schemas/window';
// import type { AceRegistryType } from '#/shared/schemas/registry-types';
// import { AceWindow } from '#/app-desktop/components/layout/ace-window';

// import SystemAIChatbar from '../components/system-ai-chatbar';

// export const registry: AceRegistryType.Window = {
//     name: 'system_ai_chat_window',
//     slug: 'system-ai-chat-window',
//     icon_slug: 'message-square-text',
//     react_behavior: 'window_shell',
//     default_config: {
//         x: 430,
//         y: 100,
//         width: 780,
//         height: 660,
//         title: 'ACE Chat',
//         window_style: 'standard',
//         is_locked: false,
//         always_on_top: false,
//     },
// };

// function SystemAIChatShell({
//     config,
//     isDragging,
//     isFocused,
//     windowStateClass,
//     close,
//     minimize,
//     dragHandleProps,
// }: {
//     config: WindowConfig;
//     isDragging: boolean;
//     isFocused: boolean;
//     windowStateClass: string;
//     close: () => void;
//     minimize: () => void;
//     dragHandleProps: AceWindowRenderProps['dragHandleProps'];
// }) {
//     return (
//         <div
//             className={[
//                 'system-shell flex h-full w-full flex-col overflow-hidden rounded-[24px] pointer-events-auto',
//                 windowStateClass,
//                 isDragging ? 'dragging active' : '',
//             ].join(' ')}
//         >
//             <div className="flex-1 overflow-hidden">
//                 <SystemAIChatbar
//                     title={config.title}
//                     dragHandleProps={dragHandleProps}
//                     isFocused={isFocused}
//                     isDragging={isDragging}
//                     onClose={close}
//                     onMinimize={minimize}
//                 />
//             </div>
//         </div>
//     );
// }

// export default function SystemAIChatWindow({ windowUid }: { windowUid: string }) {
//     return (
//         <AceWindow windowUid={windowUid} headless>
//             {({ windowConfig, dragHandleProps, isDragging, isFocused, close, minimize, resolveWindowStateClass }) => {
//                 if (!windowConfig) return null;

//                 const windowStateClass = resolveWindowStateClass();
//                 const isWindowStateActive = windowStateClass === 'active';

//                 return (
//                     <SystemAIChatShell
//                         config={windowConfig}
//                         isDragging={isDragging}
//                         isFocused={isWindowStateActive || isFocused}
//                         windowStateClass={windowStateClass}
//                         close={close}
//                         minimize={minimize}
//                         dragHandleProps={dragHandleProps}
//                     />
//                 );
//             }}
//         </AceWindow>
//     );
// }