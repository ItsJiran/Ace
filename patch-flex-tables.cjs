const fs = require('fs');
const path = 'src/core/packages/system/components/SystemSettings.tsx';
let content = fs.readFileSync(path, 'utf8');

// Keybinds table flexification
content = content.replace(
    /<table className="w-full text-sm">/,
    `<table className="w-full text-sm flex flex-col">`
);

content = content.replace(
    /<thead className="sticky top-0 z-10 bg-slate-50 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 shadow-sm">\s*<tr>/,
    `<thead className="sticky top-0 z-10 bg-slate-50 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 shadow-sm w-full block">\n                        <tr className="flex w-full">`
);

content = content.replace(
    /<SpatialVirtualizer as="tbody" targetSelector="tr" className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">/,
    `<SpatialVirtualizer as="tbody" targetSelector="tr" className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900 flex flex-col w-full">`
);

content = content.replace(
    /<tr key=\{bind\.keybind_uid\} className="hover:bg-slate-50 dark:hover:bg-zinc-800\/40 group">/g,
    `<tr key={bind.keybind_uid} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 group flex w-full items-center">`
);

// Performance table flexification
content = content.replace(
    /<tr className="bg-slate-50 dark:bg-zinc-900\/60 border-b border-slate-200 dark:border-zinc-800">/,
    `<tr className="bg-slate-50 dark:bg-zinc-900/60 border-b border-slate-200 dark:border-zinc-800 flex w-full">`
);

content = content.replace(
    /<thead(>| )/g,
    function(match, p1) { return `<thead className="w-full block"` + p1; }
);

content = content.replace(
    /<tr key=\{entry\.memory_uid\} className="hover:bg-slate-50 dark:hover:bg-zinc-800\/40 ">/g,
    `<tr key={entry.memory_uid} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 flex w-full items-center">`
);

// Add width to td cells for keybinds 
content = content.replace(
    /<td className="px-4 py-3">/g,
    `<td className="px-4 py-3 w-2\/5 shrink-0 break-all">`
);
content = content.replace(
    /<td className="px-4 py-3">\s*<KeyBadge/g,
    `<td className="px-4 py-3 w-1\/4 shrink-0">\n                                <KeyBadge`
);
content = content.replace(
    /<td className="px-4 py-3 text-xs text-slate-400 dark:text-zinc-500 font-mono">/g,
    `<td className="px-4 py-3 text-xs text-slate-400 dark:text-zinc-500 font-mono w-1\/4 shrink-0">`
);
content = content.replace(
    /<td className="px-4 py-3 text-right">/g,
    `<td className="px-4 py-3 text-right flex-1">`
);

// Add width to td cells for performance
content = content.replace(
    /<td className="px-4 py-2\.5">/g,
    `<td className="px-4 py-2.5 flex-1 shrink-0 min-w-0">`
);
content = content.replace(
    /<td className="px-4 py-2\.5 text-xs text-slate-500 dark:text-zinc-400">/g,
    `<td className="px-4 py-2.5 text-xs text-slate-500 dark:text-zinc-400 w-20 shrink-0">`
);
content = content.replace(
    /<td className="px-4 py-2\.5 text-right font-mono text-xs text-slate-600 dark:text-zinc-300">/g,
    `<td className="px-4 py-2.5 text-right font-mono text-xs text-slate-600 dark:text-zinc-300 w-24 shrink-0">`
);
content = content.replace(
    /<td className="px-4 py-2\.5 text-right font-mono text-xs text-slate-500 dark:text-zinc-400">/g,
    `<td className="px-4 py-2.5 text-right font-mono text-xs text-slate-500 dark:text-zinc-400 w-16 shrink-0">`
);


fs.writeFileSync(path, content, 'utf8');
