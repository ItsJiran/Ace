const fs = require('fs');

const p = 'src/core/packages/system/components/SystemSettings.tsx';
let txt = fs.readFileSync(p, 'utf8');

txt = txt.replace(
    /<table className="w-full text-sm">/g,
    '<table className="w-full text-sm flex flex-col w-full">'
);
txt = txt.replace(
    /<thead className="sticky top-0 z-10 bg-slate-50 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 shadow-sm">\s*<tr>/,
    '<thead className="sticky top-0 z-10 bg-slate-50 dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 shadow-sm w-full block">\n                        <tr className="flex w-full">'
);
txt = txt.replace(
    /<thead>\s*<tr className="bg-slate-50 dark:bg-zinc-900\/60 border-b border-slate-200 dark:border-zinc-800">/,
    '<thead className="w-full block">\n                            <tr className="bg-slate-50 dark:bg-zinc-900/60 border-b border-slate-200 dark:border-zinc-800 flex w-full">'
);


// Performance TD fix too
txt = txt.replace(
    /<td className="px-4 py-2\.5">/g,
    '<td className="px-4 py-2.5 flex-1 shrink-0 min-w-0">'
);
// Type
txt = txt.replace(
    /<td className="px-4 py-2\.5 flex-1 shrink-0 min-w-0">\s*<span className="text-\[11px\] font-mono text-slate-400 dark:text-zinc-500">\{entry\.type\}<\/span>/,
    '<td className="px-4 py-2.5 w-20 shrink-0">\n                                            <span className="text-[11px] font-mono text-slate-400 dark:text-zinc-500">{entry.type}</span>'
);
txt = txt.replace(
    /<td className="px-4 py-2\.5 text-right">/,
    '<td className="px-4 py-2.5 text-right w-24 shrink-0 font-mono text-xs text-slate-600 dark:text-zinc-300 flex items-center justify-end">'
);
txt = txt.replace(
    /<td className="px-4 py-2\.5 text-right">\s*<span/,
    '<td className="px-4 py-2.5 text-right w-16 shrink-0 font-mono text-xs text-slate-500 dark:text-zinc-400 flex items-center justify-end">\n                                            <span'
);


fs.writeFileSync(p, txt);
