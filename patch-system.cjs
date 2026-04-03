const fs = require('fs');
const path = 'src/core/packages/system/components/SystemSettings.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Revert KeybindsTab
content = content.replace(
    /(<div className="overflow-y-auto max-h-\[80vh\]">[\s\S]*?)<SpatialVirtualizer as="tbody" targetSelector="tr" className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">([\s\S]*?)<\/SpatialVirtualizer>([\s\S]*?<\/div>)/,
    `<SpatialVirtualizer className="overflow-y-auto max-h-[80vh]" targetSelector="tbody > tr">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 shadow-sm">
                        <tr>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 dark:text-zinc-500 w-2/5">Command</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 dark:text-zinc-500 w-1/4">Shortcut</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 dark:text-zinc-500 w-1/4">Scope</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500 dark:text-zinc-500">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">$2</tbody>$3</SpatialVirtualizer>`
);

// 2. Revert PerformanceTab
content = content.replace(
    /(<div className="overflow-y-auto max-h-\[60vh\] bg-white dark:bg-zinc-900">[\s\S]*?)<SpatialVirtualizer as="tbody" targetSelector="tr" className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">([\s\S]*?)<\/SpatialVirtualizer>([\s\S]*?<\/div>)/,
    `<SpatialVirtualizer className="overflow-y-auto max-h-[60vh] bg-white dark:bg-zinc-900" targetSelector="tbody > tr">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-zinc-900/60 border-b border-slate-200 dark:border-zinc-800">
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 dark:text-zinc-500">Key</th>
                                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 dark:text-zinc-500 w-20">Type</th>
                                <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500 dark:text-zinc-500 w-24">Size</th>
                                <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500 dark:text-zinc-500 w-16">Listeners</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">$2</tbody>
                    </table>
                </SpatialVirtualizer>`
);

fs.writeFileSync(path, content, 'utf8');
