import * as fs from 'fs';

const p = 'src/core/packages/system/components/SystemSettings.tsx';
let txt = fs.readFileSync(p, 'utf8');

// Keybinds
txt = txt.replace(
    '<table className="w-full text-sm">\\n                    <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 shadow-sm">\\n                        <tr>',
    '<table className="w-full text-sm flex flex-col">\\n                    <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 shadow-sm w-full block">\\n                        <tr className="flex w-full">'
);
txt = txt.replace(
    '<SpatialVirtualizer as="tbody" targetSelector="tr" className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">',
    '<SpatialVirtualizer as="tbody" targetSelector="tr" className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900 flex flex-col w-full">'
);
txt = txt.replace(
    '<tr key={bind.keybind_uid} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 group">',
    '<tr key={bind.keybind_uid} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 group flex w-full items-center">'
);

// Keybinds TD replacements
// Command
txt = txt.replace(
    /(<tr key=\{bind\.keybind_uid\}[\s\S]*?)<td className="px-4 py-3">/,
    '$1<td className="px-4 py-3 w-2/5 shrink-0 break-all">'
);
// Shortcut
txt = txt.replace(
    /(<td className="px-4 py-3 w-2\/5 shrink-0 break-all">[\s\S]*?)<td className="px-4 py-3">/,
    '$1<td className="px-4 py-3 w-1/4 shrink-0 flex items-center">'
);
// Scope - already correctly matched?
txt = txt.replace(
    /<td className="px-4 py-3 text-xs text-slate-400 dark:text-zinc-500 font-mono">/,
    '<td className="px-4 py-3 text-xs text-slate-400 dark:text-zinc-500 font-mono w-1/4 shrink-0 flex items-center">'
);
// Status
txt = txt.replace(
    /<td className="px-4 py-3 text-right">/,
    '<td className="px-4 py-3 text-right flex-1 flex justify-end items-center">'
);

// Performance
txt = txt.replace(
    '<table className="w-full text-sm">\\n                        <thead>\\n                            <tr className="bg-slate-50 dark:bg-zinc-900/60 border-b border-slate-200 dark:border-zinc-800">',
    '<table className="w-full text-sm flex flex-col">\\n                        <thead className="w-full block">\\n                            <tr className="bg-slate-50 dark:bg-zinc-900/60 border-b border-slate-200 dark:border-zinc-800 flex w-full">'
);
txt = txt.replace(
    '<SpatialVirtualizer as="tbody" targetSelector="tr" className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900">',
    '<SpatialVirtualizer as="tbody" targetSelector="tr" className="divide-y divide-slate-100 dark:divide-zinc-800 bg-white dark:bg-zinc-900 flex flex-col w-full">'
);
txt = txt.replace(
    '<tr key={entry.memory_uid} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 ">',
    '<tr key={entry.memory_uid} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 flex w-full items-center">'
);

fs.writeFileSync(p, txt);
