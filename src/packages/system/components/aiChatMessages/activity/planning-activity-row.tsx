// import type { AIRenderer } from '#/shared/schemas/ai';

// import { renderActivityIcon, toPayloadRecord } from '../utils';

// function resolveStatusToneClass(status?: string) {
//     if (status === 'error') return 'system-chat-tone-error';
//     if (status === 'completed') return 'system-chat-tone-success';
//     return 'system-chat-tone-active';
// }

// interface PlanTodoItem {
//     title?: string;
//     detail?: string;
//     is_complete?: boolean;
// }

// function normalizeTodoItems(payload: Record<string, unknown>): PlanTodoItem[] {
//     const raw = Array.isArray(payload.todo_items) ? payload.todo_items : [];
//     return raw.filter(
//         (item): item is Record<string, unknown> =>
//             !!item && typeof item === 'object' && !Array.isArray(item),
//     ) as PlanTodoItem[];
// }

// export function PlanningActivityRow({ renderer }: { renderer: AIRenderer }) {
//     const status = renderer.status ?? 'loading';
//     const statusTone = resolveStatusToneClass(status);
//     const payload = toPayloadRecord(renderer.payload);
//     const title =
//         typeof payload.title === 'string' && payload.title.trim().length > 0
//             ? payload.title
//             : 'Current Plan';

//     const items = normalizeTodoItems(payload);
//     const totalCount = items.length;
//     const doneCount = items.filter((item) => item.is_complete === true).length;
//     const activeIndex = items.findIndex((item) => item.is_complete !== true);
//     const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

//     return (
//         <div className="system-chat-renderer-surface overflow-hidden">
//             {/* ── Header ── */}
//             <div className="system-chat-renderer-header">
//                 <div className="flex min-w-0 flex-1 items-center gap-2">
//                     <span className={statusTone}>{renderActivityIcon(renderer, 14)}</span>
//                     <span className="system-chat-renderer-heading text-[10px]">{title}</span>
//                 </div>
//                 <span className={`system-chat-tone-pill ${statusTone}`}>{status}</span>
//             </div>

//             {/* ── Progress bar ── */}
//             {totalCount > 0 && (
//                 <div className="flex items-center gap-3 border-b border-white/10 px-3 py-2">
//                     <div className="system-chat-meter-track flex-1">
//                         <div
//                             className="system-chat-meter-fill"
//                             style={{ width: `${progressPct}%` }}
//                         />
//                     </div>
//                     <span className="system-chat-meta-note tabular-nums">
//                         {doneCount}/{totalCount}
//                     </span>
//                 </div>
//             )}

//             {/* ── Todo items ── */}
//             {totalCount > 0 ? (
//                 <div className="relative flex flex-col gap-1.5 p-2">
//                     {/* vertical rail */}
//                     {totalCount > 1 && (
//                         <div className="pointer-events-none absolute bottom-4 left-[19px] top-4 w-px bg-white/10" />
//                     )}

//                     {items.map((item, idx) => {
//                         const itemTitle =
//                             typeof item.title === 'string' && item.title.trim().length > 0
//                                 ? item.title
//                                 : `Step ${idx + 1}`;
//                         const itemDetail =
//                             typeof item.detail === 'string' && item.detail.trim().length > 0
//                                 ? item.detail
//                                 : '';
//                         const isComplete = item.is_complete === true;
//                         const isCurrent = !isComplete && idx === activeIndex;

//                         return (
//                             <div
//                                 key={idx}
//                                 className={[
//                                     'system-chat-todo-item flex items-start gap-2 px-2.5 py-2',
//                                     isCurrent ? 'is-current' : '',
//                                     isComplete ? 'is-complete' : '',
//                                 ]
//                                     .filter(Boolean)
//                                     .join(' ')}
//                             >
//                                 {/* node */}
//                                 <div
//                                     className={[
//                                         'system-chat-todo-node mt-0.5 h-6 w-6 flex-shrink-0',
//                                         isCurrent ? 'is-current' : '',
//                                         isComplete ? 'is-complete' : '',
//                                     ]
//                                         .filter(Boolean)
//                                         .join(' ')}
//                                 >
//                                     {isComplete ? (
//                                         <span className="system-chat-tone-success text-[10px]">✓</span>
//                                     ) : isCurrent ? (
//                                         <span className="system-chat-tone-active text-[9px]">●</span>
//                                     ) : (
//                                         <span className="system-chat-icon-muted text-[9px]">○</span>
//                                     )}
//                                 </div>

//                                 {/* content */}
//                                 <div className="min-w-0 flex-1">
//                                     <div
//                                         className={[
//                                             'system-chat-todo-title text-[11px]',
//                                             isComplete ? 'line-through opacity-60' : '',
//                                         ]
//                                             .filter(Boolean)
//                                             .join(' ')}
//                                     >
//                                         {itemTitle}
//                                     </div>
//                                     {itemDetail && (
//                                         <div className="system-chat-todo-detail text-[10px]">
//                                             {itemDetail}
//                                         </div>
//                                     )}
//                                 </div>

//                                 {/* per-item status dot */}
//                                 {isCurrent && (
//                                     <span className="system-chat-tone-pill system-chat-tone-active mt-0.5 flex-shrink-0">
//                                         now
//                                     </span>
//                                 )}
//                             </div>
//                         );
//                     })}
//                 </div>
//             ) : (
//                 <div className="system-chat-inline-empty px-3 py-2">No plan steps yet.</div>
//             )}
//         </div>
//     );
// }
