const fs = require('fs');
const path = 'src/core/packages/system/components/SystemSettings.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Keybinds tab: Change wrapper from div to tbody
content = content.replace(
    /<SpatialVirtualizer className="overflow-y-auto max-h-\[80vh\]" targetSelector="tbody > tr">\s*<table className="w-full text-sm">\s*<thead className="sticky top-0 z-10 bg-slate-50 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 shadow-sm">([\s\S]*?)<\/thead>\s*<tbody className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">([\s\S]*?)<\/tbody>\s*<\/table>\s*<\/SpatialVirtualizer>/,
    `<div className="overflow-y-auto max-h-[80vh]">
                <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 shadow-sm">$1</thead>
                    <SpatialVirtualizer as="tbody" targetSelector="tr" className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">$2</SpatialVirtualizer>
                </table>
            </div>`
);

// 2. Performance tab: Change tbody to SpatialVirtualizer
content = content.replace(
    /<tbody className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">([\s\S]*?)<\/tbody>/,
    `<SpatialVirtualizer as="tbody" targetSelector="tr" className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">$1</SpatialVirtualizer>`
);

fs.writeFileSync(path, content, 'utf8');
