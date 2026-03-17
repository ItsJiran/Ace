import React from 'react';
import type { PackageManifest } from '#/schemas/registry';
import { BadgeCheck, Calendar, Codesandbox, GitBranch, Layers, Link2, ShieldCheck, Tag, Terminal } from 'lucide-react';

interface PackageDetailProps {
    pkg: PackageManifest;
    onClose: () => void;
}

export function PackageDetail({ pkg, onClose }: PackageDetailProps) {
    return (
        <div className="absolute inset-0 bg-zinc-950/95 backdrop-blur-md flex flex-col z-50 animate-in slide-in-from-right-10 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/5">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                        {pkg.domain === 'tool' && <Terminal size={20} className="text-indigo-400" />}
                        {pkg.domain === 'widget' && <Layers size={20} className="text-indigo-400" />}
                        {pkg.domain === 'component' && <Codesandbox size={20} className="text-indigo-400" />}
                    </div>
                    <div>
                        <h2 className="text-sm font-bold text-white leading-tight">{pkg.name}</h2>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60 font-mono">v{pkg.version}</span>
                            <span className="text-[10px] text-white/40 font-medium capitalize">{pkg.domain}</span>
                        </div>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 hover:bg-white/10 rounded-md text-white/40 hover:text-white transition-colors"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4 space-y-6">
                
                {/* Description */}
                <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider">About</h3>
                    <p className="text-sm text-zinc-300 leading-relaxed">
                        {pkg.description || "No description provided."}
                    </p>
                    {pkg.repositoryUrl && (
                        <a href={pkg.repositoryUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-2">
                            <Link2 size={12} />
                            View Repository
                        </a>
                    )}
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-white/5 rounded-lg border border-white/5 space-y-1">
                        <div className="flex items-center gap-1.5 text-white/40 text-[10px]">
                            <GitBranch size={10} />
                            <span>Version</span>
                        </div>
                        <div className="text-xs font-mono text-zinc-200">{pkg.version}</div>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg border border-white/5 space-y-1">
                        <div className="flex items-center gap-1.5 text-white/40 text-[10px]">
                            <BadgeCheck size={10} />
                            <span>Status</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${pkg.status === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-zinc-500'}`} />
                            <span className="text-xs font-medium text-zinc-200 capitalize">{pkg.status}</span>
                        </div>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg border border-white/5 space-y-1">
                        <div className="flex items-center gap-1.5 text-white/40 text-[10px]">
                            <Calendar size={10} />
                            <span>Released</span>
                        </div>
                        <div className="text-xs font-mono text-zinc-200">{pkg.releaseDate ? new Date(pkg.releaseDate).toLocaleDateString() : 'N/A'}</div>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg border border-white/5 space-y-1">
                        <div className="flex items-center gap-1.5 text-white/40 text-[10px]">
                            <Tag size={10} />
                            <span>Author</span>
                        </div>
                        <div className="text-xs font-medium text-zinc-200 truncate">{pkg.author || 'System Core'}</div>
                    </div>
                </div>

                {/* Permissions */}
                {pkg.permissions && pkg.permissions.length > 0 && (
                    <div className="space-y-2">
                        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider flex items-center gap-2">
                            <ShieldCheck size={12} />
                            Permissions Required
                        </h3>
                        <div className="grid gap-2">
                            {pkg.permissions.map((perm) => (
                                <div key={perm} className="px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-md flex items-center gap-2">
                                    <div className="w-1 h-1 rounded-full bg-amber-500" />
                                    <span className="text-xs font-mono text-amber-200">{perm}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Dependencies */}
                 {pkg.dependencies && pkg.dependencies.length > 0 && (
                    <div className="space-y-2">
                        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider flex items-center gap-2">
                            <Layers size={12} />
                            Dependencies
                        </h3>
                        <div className="space-y-1">
                            {pkg.dependencies.map((dep) => (
                                <div key={dep.id} className="flex items-center justify-between px-3 py-2 bg-white/5 rounded-md border border-white/5">
                                    <span className="text-xs text-zinc-300 font-medium">{dep.id}</span>
                                    <span className="text-[10px] text-white/40 px-1.5 py-0.5 bg-black/30 rounded border border-white/5 font-mono">
                                        {dep.version || 'latest'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Actions Footer */}
            <div className="p-3 border-t border-white/5 bg-black/20 flex gap-2">
                <button className="flex-1 py-2 bg-white/5 hover:bg-white/10 text-xs font-medium text-zinc-300 rounded-md border border-white/5 transition-colors">
                    Check Updates
                </button>
                 <button className="flex-1 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-xs font-medium text-indigo-300 rounded-md border border-indigo-500/20 transition-colors">
                    Manage Config
                </button>
            </div>
        </div>
    );
}
