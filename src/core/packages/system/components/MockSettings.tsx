import { useState, useMemo } from 'react';
import { RenderCounterBadge } from '#/components/dev/RenderCounterBadge';

/**
 * MockSettings: Pure local-state version of SystemSettings for performance testing
 * 
 * This component has ZERO global subscriptions.
 * It generates dummy data using only useState/useMemo.
 * 
 * Purpose: Verify if global state subscriptions are the FPS bottleneck.
 * If MockSettings runs at 60 FPS while SystemSettings drops to 12 FPS,
 * then the problem is definitely global state cascading.
 */
export default function MockSettings() {
    // Generate dummy packages locally (no subscription)
    const [packages] = useState(() => {
        return Array.from({ length: 50 }, (_, i) => ({
            manifest: {
                package_name: `mock-package-${i}`,
                display_name: `Mock Package ${i}`,
                version: '1.0.0',
                owner_scope: i % 2 === 0 ? 'system' : 'user',
            },
            domains: {
                components: { [`comp-${i}`]: true },
                processes: { [`proc-${i}`]: true },
                features: { [`feat-${i}`]: true },
            },
        }));
    });

    // Generate dummy keybinds locally (no subscription)
    const [keybinds] = useState(() => {
        return Array.from({ length: 100 }, (_, i) => ({
            keybind_uid: `keybind-${i}`,
            description: `Action ${i}`,
            shortcut: `Ctrl+Shift+${i % 26}`,
            intent: { action: `action_${i}` },
            enabled: i % 3 !== 0,
        }));
    });

    // Memoize to avoid recalculation
    const packageCount = useMemo(() => packages.length, [packages]);
    const keybindCount = useMemo(() => keybinds.length, [keybinds]);

    return (
        <div className="h-full w-full flex flex-col bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-slate-200 overflow-hidden font-sans relative">
            <RenderCounterBadge componentName="MockSettings" />
            <header className="px-6 py-5 border-b border-slate-200 dark:border-zinc-800 flex-shrink-0">
                <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Mock Settings (Local State Only)</h1>
                <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">No global subscriptions - pure React state. Testing if this stays 60 FPS.</p>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {/* Packages Section */}
                <section>
                    <h2 className="text-lg font-medium mb-4 text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <span className="w-1 h-5 bg-blue-600 rounded-full"></span>
                        Mock Packages ({packageCount})
                    </h2>
                    <div className="grid grid-cols-1 gap-4">
                        {packages.map((pkg) => (
                            <div key={pkg.manifest.package_name} className="p-5 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-slate-200 dark:border-zinc-800/60">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                                            {pkg.manifest.display_name || pkg.manifest.package_name}
                                        </h3>
                                        <div className="text-xs text-slate-500 font-mono mt-0.5">
                                            {pkg.manifest.package_name} <span className="text-slate-400">• v{pkg.manifest.version}</span>
                                        </div>
                                    </div>
                                    <span className="text-xs px-2 py-1 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 font-medium capitalize">
                                        {pkg.manifest.owner_scope}
                                    </span>
                                </div>

                                {/* Domains List */}
                                <div className="mt-4 flex flex-wrap gap-2">
                                    {Object.entries(pkg.domains || {}).map(([domain, entries]) => {
                                        const count = Object.keys(entries || {}).length;
                                        if (count === 0) return null;
                                        return (
                                            <div key={domain} className="group relative">
                                                <span className="text-xs px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900/30 font-medium">
                                                    {count} {domain}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Keybinds Section */}
                <section>
                    <h2 className="text-lg font-medium mb-4 text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <span className="w-1 h-5 bg-emerald-500 rounded-full"></span>
                        Mock Keybindings ({keybindCount})
                    </h2>
                    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-slate-200 dark:border-zinc-800/60 overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 dark:bg-zinc-900/50 text-slate-500 dark:text-zinc-500 font-medium border-b border-slate-200 dark:border-zinc-800">
                                <tr>
                                    <th className="px-5 py-3 w-1/3">Command</th>
                                    <th className="px-5 py-3 w-1/3">Shortcut</th>
                                    <th className="px-5 py-3 w-1/3">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                                {keybinds.map((bind) => (
                                    <tr key={bind.keybind_uid} className="hover:bg-slate-50 dark:hover:bg-zinc-800/30">
                                        <td className="px-5 py-3 font-medium text-slate-800 dark:text-slate-200">
                                            {bind.description || bind.keybind_uid}
                                            <div className="text-xs text-slate-400 font-mono mt-0.5">{bind.intent?.action}</div>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span className="inline-block px-2 py-1 rounded border border-slate-200 dark:border-zinc-700 bg-slate-100 dark:bg-zinc-800 text-xs font-mono text-slate-600 dark:text-zinc-300 shadow-sm">
                                                {bind.shortcut}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-slate-500 dark:text-zinc-500">
                                            {bind.enabled ? (
                                                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-500 text-xs font-medium">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                    Active
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1.5 text-slate-400 text-xs font-medium">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                                                    Inactive
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </div>
    );
}
