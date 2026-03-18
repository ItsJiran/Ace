import type { AceRegistryType } from '#/schemas/registryTypes';
import { useEffect, useState } from 'react';
import { PackageDetail } from './PackageDetail';
import type { PackageManifest, RegistryDomain } from '#/schemas/registry';
import { ToolEngine } from '#/services/toolEngine';
// import { COMPONENT_CATALOG } from './ComponentRegistry'; // Circular dependency
import { Search, Grid, List, Activity, Terminal, Layers, Codesandbox, Settings2, DownloadCloud, AlertTriangle } from 'lucide-react';

export const registry: AceRegistryType.Component = {
    name: 'package_registry_view',
    react_behavior: 'dev_package_registry',
};

const COMPONENT_CATALOG = [
    'ram_viewer',
    'event_viewer',
    'process_monitor',
    'tools_registry_list',
    'pipeline_registry_list',
    'window_registry_list',
    'package_registry_view',
    'system_console',
    'system_widget',
    'loading_widget',
    // ... add others from ComponentRegistry as needed for the demo
];

const MOCK_METADATA: Record<string, Partial<PackageManifest>> = {
    'system_console': {
        description: 'Core system terminal for logging and debug output.',
        version: '1.2.0',
        author: 'System Core',
        domain: 'widget',
        dependencies: [{ id: 'logger_service', domain: 'feature' }]
    },
    'process_monitor': {
        description: 'Real-time task and process visualization.',
        version: '0.9.5',
        author: 'DevTools Team',
        domain: 'widget',
        status: 'active'
    },
    'event_viewer': {
        description: 'Inspects real-time events on the EventBus.',
        version: '0.8.0',
        author: 'DevTools Team',
        domain: 'widget'
    },
    'ram_viewer': {
        description: 'Visualizes global RAM state and memory usage.',
        version: '1.0.0',
        author: 'System Core',
        domain: 'widget'
    },
    'loading_widget': {
        description: 'Generic loading indicator for async operations.',
        version: '1.0.0',
        author: 'System Core',
        domain: 'component',
        status: 'inactive'
    }
};

export function PackageRegistryView() {
    const [packages, setPackages] = useState<PackageManifest[]>([]);
    const [selectedPkg, setSelectedPkg] = useState<PackageManifest | null>(null);
    const [filter, setFilter] = useState<RegistryDomain | 'all'>('all');
    const [search, setSearch] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    useEffect(() => {
        // 1. Fetch Tools
        const tools = (ToolEngine.getManifest() as any[]).map(t => ({
            id: t.name,
            name: t.name,
            version: '1.0.0', // Mock version for tools
            description: t.description,
            domain: 'tool' as RegistryDomain,
            author: 'System Tool',
            status: 'active' as const
        }));

        // 2. Fetch Components/Widgets from Catalog
        const components = COMPONENT_CATALOG.map(key => {
            const meta = MOCK_METADATA[key] || {};
            return {
                id: key,
                name: key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                version: meta.version || '0.1.0',
                description: meta.description || 'No description available for this component.',
                domain: meta.domain || 'component', // Default to component
                author: meta.author || 'Unknown',
                status: meta.status || 'active',
                dependencies: meta.dependencies,
                permissions: meta.permissions
            } as PackageManifest;
        });

        setPackages([...tools, ...components]);
    }, []);

    const filteredPackages = packages.filter(p => {
        if (filter !== 'all' && p.domain !== filter) return false;
        if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.id.includes(search.toLowerCase())) return false;
        return true;
    });

    return (
        <div className="h-full w-full bg-zinc-950 text-zinc-300 flex flex-col relative overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
                        <DownloadCloud size={18} className="text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-sm font-bold text-white leading-tight">Package Registry</h1>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                            <span>{packages.length} Packages Installed</span>
                            <span className="w-1 h-1 rounded-full bg-zinc-600" />
                            <span>v2.4.0-alpha</span>
                        </div>
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                        <input 
                            type="text" 
                            placeholder="Search packages..." 
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="bg-zinc-900 border border-zinc-700/50 rounded-md py-1.5 pl-8 pr-3 text-xs w-48 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
                        />
                    </div>
                    <div className="w-px h-4 bg-zinc-800 mx-1" />
                    <button 
                        onClick={() => setViewMode('grid')}
                        className={`p-1.5 rounded hover:bg-zinc-800 transition-colors ${viewMode === 'grid' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}
                    >
                        <Grid size={14} />
                    </button>
                    <button 
                        onClick={() => setViewMode('list')}
                        className={`p-1.5 rounded hover:bg-zinc-800 transition-colors ${viewMode === 'list' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}
                    >
                        <List size={14} />
                    </button>
                    <div className="w-px h-4 bg-zinc-800 mx-1" />
                    <button className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors">
                        <Settings2 size={14} />
                    </button>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-900/20 flex items-center gap-2 overflow-x-auto no-scrollbar">
                {[
                    { id: 'all', label: 'All Packages', icon: Activity },
                    { id: 'tool', label: 'Tools', icon: Terminal },
                    { id: 'widget', label: 'Widgets', icon: Layers },
                    { id: 'component', label: 'Components', icon: Codesandbox },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setFilter(tab.id as any)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                            filter === tab.id 
                                ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' 
                                : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                        }`}
                    >
                        <tab.icon size={12} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto p-4 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                {filteredPackages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-500 opacity-60">
                        <Search size={32} className="mb-2 text-zinc-600" />
                        <p className="text-sm">No packages found matching criteria.</p>
                    </div>
                ) : (
                    <div className={viewMode === 'grid' ? "grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3" : "flex flex-col gap-2"}>
                        {filteredPackages.map((pkg) => (
                            <div 
                                key={pkg.id} 
                                onClick={() => setSelectedPkg(pkg)}
                                className={`group relative bg-zinc-900/40 border border-zinc-800/80 rounded-lg p-3 hover:bg-zinc-800/60 hover:border-zinc-700/80 cursor-pointer transition-all active:scale-[0.99] ${viewMode === 'list' ? 'flex items-center gap-4' : 'flex flex-col justify-between h-32'}`}
                            >
                                <div className="flex items-start justify-between w-full">
                                    <div className="flex items-center gap-2.5">
                                        <div className={`w-8 h-8 rounded-md flex items-center justify-center border ${
                                            pkg.domain === 'tool' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                                            pkg.domain === 'widget' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                                            'bg-blue-500/10 border-blue-500/20 text-blue-500'
                                        }`}>
                                            {pkg.domain === 'tool' && <Terminal size={14} />}
                                            {pkg.domain === 'widget' && <Layers size={14} />}
                                            {pkg.domain === 'component' && <Codesandbox size={14} />}
                                        </div>
                                        <div>
                                            <h3 className="text-xs font-bold text-zinc-200 group-hover:text-white transition-colors truncate max-w-[120px]" title={pkg.name}>{pkg.name}</h3>
                                            <div className="flex items-center gap-1.5">
                                                 <span className={`text-[9px] px-1 rounded flex items-center gap-1 ${
                                                    pkg.domain === 'tool' ? 'bg-amber-950/30 text-amber-400/80' : 
                                                    pkg.domain === 'widget' ? 'bg-emerald-950/30 text-emerald-400/80' : 
                                                    'bg-blue-950/30 text-blue-400/80'
                                                }`}>
                                                    {pkg.domain}
                                                </span>
                                                <span className="text-[9px] text-zinc-600 font-mono">v{pkg.version}</span>
                                            </div>
                                        </div>
                                    </div>
                                    {pkg.status === 'error' && <AlertTriangle size={12} className="text-red-500" />}
                                </div>

                                <p className={`text-[10px] text-zinc-500 mt-2 line-clamp-2 ${viewMode === 'list' ? 'flex-1 mt-0' : ''}`}>
                                    {pkg.description || "No description provided."}
                                </p>

                                <div className={`flex items-center justify-between mt-auto pt-2 w-full ${viewMode === 'list' ? 'w-auto pt-0 mt-0 gap-4' : ''}`}>
                                    <div className="flex items-center gap-1.5 text-[9px] text-zinc-600">
                                        <div className={`w-1.5 h-1.5 rounded-full ${pkg.status === 'active' ? 'bg-zinc-600' : 'bg-red-900/50'}`} />
                                        <span className="capitalize">{pkg.status}</span>
                                    </div>
                                    <span className="text-[9px] text-zinc-700 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">{pkg.author?.split(' ')[0]}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Detail Drawer */}
            {selectedPkg && (
                <PackageDetail pkg={selectedPkg} onClose={() => setSelectedPkg(null)} />
            )}
        </div>
    );
}
