// import type { AceRegistryType } from '#/schemas/registry-types';
// import { AceWindow } from '#/components/layout/ace-window';
// import { AceWindowHead } from '#/components/layout/ace-window-head';
// import { Terminal } from 'lucide-react';
// import SystemConsole from '../components/system-console';

// // eslint-disable-next-line react-refresh/only-export-components
// export const registry: AceRegistryType.Window = {
//     name: 'System Console Window',
//     slug: 'system-console-window',
//     icon_slug: 'terminal',
//     react_behavior: 'window_shell',
// };

// export default function SystemConsoleWindow({ windowUid }: { windowUid: string }) {
//     return (
//         <AceWindow windowUid={windowUid} headless>
//             {({ dragHandleProps, close, minimize, isFocused, isDragging }) => (
//                 <div 
//                     className={`w-full h-full flex flex-col transition-colors rounded-xl overflow-hidden ${
//                          // PERF: Disable expensive backdrop blur completely
//                         isDragging ? 'bg-zinc-950/95' : ''
//                     } ${
//                         isFocused 
//                             ? 'bg-zinc-950/90 shadow-black/50 ring-1 ring-white/10' 
//                             : 'bg-zinc-950/70 shadow-black/20 ring-1 ring-white/5'
//                     }`}
//                 >
//                     {/* Window Chrome / Titlebar */}
//                     <AceWindowHead
//                         title="System Logs"
//                         icon={<Terminal size={14} />}
//                         dragHandleProps={dragHandleProps}
//                         isFocused={isFocused}
//                         onMinimize={minimize}
//                         onClose={close}
//                     />

//                     {/* Content Area */}
//                     <div className="flex-1 overflow-hidden relative border-x border-b border-white/10 rounded-b-xl">
//                         <SystemConsole />
//                     </div>
//                 </div>
//             )}
//         </AceWindow>
//     );
// };
