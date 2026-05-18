// import { useMemo, useState } from 'react';
// import { Bot, Activity, Keyboard } from 'lucide-react';
// import { useAceMemory } from '#/hooks/use-ace-memory';
// import type { AIGatewayConfig } from '#/schemas/ai-gateway';
// import type { Keybind } from '#/schemas/keybinds';
// import { AIConnectionSettingsTab } from './settings/ai-connection-settings-tab';
// import { AIHealthSettingsTab } from './settings/ai-health-settings-tab';
// import { KeybindSettingsTab } from './settings/keybind-settings-tab';

// type SystemSettingsTab = 'ai_connection' | 'ai_health' | 'keybinds';

// const TAB_CONFIG: Array<{
//     key: SystemSettingsTab;
//     label: string;
//     description: string;
//     icon: typeof Bot;
// }> = [
//     {
//         key: 'ai_connection',
//         label: 'AI Connection',
//         description: 'Provider selection, API keys, and model inventory.',
//         icon: Bot,
//     },
//     {
//         key: 'ai_health',
//         label: 'AI Health',
//         description: 'Gateway reachability, radar scan, and response testing.',
//         icon: Activity,
//     },
//     {
//         key: 'keybinds',
//         label: 'Keybinds',
//         description: 'Persisted keyboard shortcuts managed by ConfigEngine.',
//         icon: Keyboard,
//     },
// ];

// export default function SystemSettings() {
//     const [activeTab, setActiveTab] = useState<SystemSettingsTab>('ai_connection');
//     const gatewayConfig = useAceMemory<AIGatewayConfig>(window.ACE.ai_gateway.memory_uid);
//     const keybinds = useAceMemory<Keybind[]>('system:keybinds') ?? [];

//     const activeProvider = gatewayConfig?.active_provider ?? gatewayConfig?.active_sdk ?? 'none';
//     const activeModel = gatewayConfig?.active_model ?? 'not selected';
//     const modelCount = useMemo(() => {
//         const providers = gatewayConfig?.providers ?? gatewayConfig?.sdks;
//         if (!providers) return 0;
//         return Object.values(providers).reduce((total, provider) => total + (provider?.models?.length ?? 0), 0);
//     }, [gatewayConfig]);

//     return (
//         <div className="flex h-full w-full overflow-hidden bg-[linear-gradient(180deg,#f7f9fc_0%,#eef2f8_100%)] text-slate-900 dark:bg-[linear-gradient(180deg,#121722_0%,#0d1118_100%)] dark:text-slate-100">
//             <aside className="flex h-full w-[250px] shrink-0 flex-col overflow-hidden border-r border-slate-200/80 bg-white/70 p-4 backdrop-blur dark:border-white/10 dark:bg-[#131926]/80">
//                 <div>
//                     <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-600 dark:text-blue-300">System Settings</p>
//                     <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Runtime Configuration</h2>
//                     <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Manage AI connectivity, health checks, and persisted keyboard shortcuts without bloating the window shell.</p>
//                 </div>

//                 <div className="mt-5 grid gap-2">
//                     <SummaryStat label="Active SDK" value={String(activeProvider)} />
//                     <SummaryStat label="Active Model" value={activeModel} />
//                     <SummaryStat label="Known Models" value={String(modelCount)} />
//                     <SummaryStat label="Keybinds" value={String(keybinds.length)} />
//                 </div>

//                 <nav className="mt-6 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
//                     {TAB_CONFIG.map((tab) => {
//                         const Icon = tab.icon;
//                         const isActive = tab.key === activeTab;
//                         return (
//                             <button
//                                 key={tab.key}
//                                 type="button"
//                                 data-window-action="true"
//                                 onClick={() => setActiveTab(tab.key)}
//                                 className={[
//                                     'rounded-2xl border px-3 py-3 text-left transition-colors',
//                                     isActive
//                                         ? 'border-blue-300 bg-blue-50 text-blue-950 shadow-sm dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-100'
//                                         : 'border-slate-200 bg-white/70 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10',
//                                 ].join(' ')}
//                             >
//                                 <div className="flex items-start gap-3">
//                                     <div className={[
//                                         'mt-0.5 rounded-xl p-2',
//                                         isActive ? 'bg-blue-600 text-white dark:bg-blue-400 dark:text-slate-950' : 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300',
//                                     ].join(' ')}>
//                                         <Icon size={16} />
//                                     </div>
//                                     <div>
//                                         <p className="text-sm font-semibold">{tab.label}</p>
//                                         <p className="mt-1 text-[11px] leading-5 text-inherit/80">{tab.description}</p>
//                                     </div>
//                                 </div>
//                             </button>
//                         );
//                     })}
//                 </nav>
//             </aside>

//             <main className="min-w-0 flex-1 overflow-hidden p-5">
//                 <div className="h-full overflow-y-auto pr-1">
//                     {activeTab === 'ai_connection' ? <AIConnectionSettingsTab /> : null}
//                     {activeTab === 'ai_health' ? <AIHealthSettingsTab /> : null}
//                     {activeTab === 'keybinds' ? <KeybindSettingsTab /> : null}
//                 </div>
//             </main>
//         </div>
//     );
// }

// function SummaryStat({ label, value }: { label: string; value: string }) {
//     return (
//         <div className="rounded-2xl border border-slate-200 bg-white/85 px-3 py-2.5 shadow-sm dark:border-white/10 dark:bg-white/5">
//             <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{label}</p>
//             <p className="mt-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">{value}</p>
//         </div>
//     );
// }
