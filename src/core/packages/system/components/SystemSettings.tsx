import { useAceMemory } from '#/hooks/useAceMemory';
import type { RegistryPackage } from '#/schemas/registry';
import type { AceRegistryType } from '#/schemas/registryTypes';
import { RenderCounterBadge } from '#/components/dev/RenderCounterBadge';

// Define AceRegistryType for this component
export const registry: AceRegistryType.Component = {
    name: 'System Settings',
    slug: 'system-settings',
    react_behavior: 'system_settings_ui',
    data_requirements: ['system:package_registry', 'system:keybinds']
};

export default function SystemSettings() {
    const packages = useAceMemory<RegistryPackage[]>('system:package_registry') || [];
    const keybinds = useAceMemory<any[]>('system:keybinds') || [];

    return (
        <div className="h-full w-full flex flex-col bg-slate-50 dark:bg-zinc-950 text-slate-800 dark:text-slate-200 overflow-hidden font-sans relative">
            <RenderCounterBadge componentName="SystemSettings" />
            <header className="px-6 py-5 border-b border-slate-200 dark:border-zinc-800 flex-shrink-0">
                <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">System Settings</h1>
                <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">Manage packages, keybinds, and system configuration.</p>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {/* Packages Section */}
                <section>
                    <h2 className="text-lg font-medium mb-4 text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <span className="w-1 h-5 bg-blue-600 rounded-full"></span>
                        Installed Packages
                    </h2>
                    <div className="grid grid-cols-1 gap-4">
                        {packages.map((pkg) => (
                            <div key={pkg.manifest.package_name} className="p-5 bg-white dark:bg-zinc-900 rounded-xl shadow-sm border border-slate-200 dark:border-zinc-800/60 hover:shadow-md transition-shadow duration-200">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <h3 className="font-semibold text-slate-900 dark:text-slate-100">{pkg.manifest.display_name || pkg.manifest.package_name}</h3>
                                        <div className="text-xs text-slate-500 font-mono mt-0.5">{pkg.manifest.package_name} <span className="text-slate-400">• v{pkg.manifest.version}</span></div>
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
                        Keybindings
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
                                    <tr key={bind.keybind_uid} className="hover:bg-slate-50 dark:hover:bg-zinc-800/30 transition-colors">
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
                                                   <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-zinc-600"></span>
                                                   Disabled
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
